import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, ArrowUp, ArrowDown, CornerDownLeft, Send, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { homeCall } from '../../lib/homeClient';
import { sleep } from '../../lib/homeTimer';
import { Spinner, Tap } from './motion';

// The assistant's private browser, live on this screen. You can tap, type and scroll in it, for example to sign in to an account.
// What you type goes straight to the browser and is never kept.
export default function BrowserView({ device, reason, onClose, onDone, onCant }) {
  const [frame, setFrame] = useState(null); // { image, w, h, title, url, open }
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [waiting, setWaiting] = useState(true);
  const queue = useRef([]); const alive = useRef(true); const imgRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    (async () => {
      let fails = 0;
      while (alive.current) {
        const op = queue.current.shift() || { op: 'frame' };
        try {
          const { id } = await homeCall('job_create', { deviceId: device.id, type: 'browser_view', args: op, summary: 'Showing the browser' });
          let got = null;
          for (let i = 0; i < 40 && alive.current; i++) {
            await sleep(350);
            const j = await homeCall('job_get', { id });
            if (j.status === 'done') { got = j; break; }
            if (j.status === 'error' || j.status === 'cancelled') throw new Error(String(j.result || 'The computer could not show the browser.').replace(/^Error:\s*/, ''));
          }
          if (!alive.current) return;
          if (!got) throw new Error('The computer did not answer. Is it on and connected?');
          const meta = JSON.parse(got.result || '{}');
          setFrame(meta.open ? { ...meta, image: got.image || '' } : { open: false });
          setWaiting(false); setErr(''); fails = 0;
        } catch (e) { if (++fails > 3) { setErr(e.message); setWaiting(false); } }
        if (!queue.current.length) await sleep(frame && frame.open ? 900 : 1500);
      }
    })();
    return () => { alive.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  const send = (o) => queue.current.push(o);
  const tap = (e) => {
    if (!frame || !frame.w || !imgRef.current) return;
    const r = imgRef.current.getBoundingClientRect();
    send({ op: 'tap', x: Math.round(((e.clientX - r.left) / r.width) * frame.w), y: Math.round(((e.clientY - r.top) / r.height) * frame.h) });
  };
  const typeIt = (e) => { e.preventDefault(); if (!text) return; send({ op: 'text', text }); setText(''); };
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/90 p-3 sm:p-6" role="dialog" aria-label="Browser">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121217] text-white">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{frame && frame.open ? (frame.title || host(frame.url) || 'Browser') : 'Browser'}</p><p className="truncate text-[11px] text-slate-400">{frame && frame.open ? host(frame.url) : device.name}</p></div>
          {frame && frame.open && <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold tracking-wide"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE</span>}
          <button onClick={onClose} aria-label="Close the browser"><X size={22} className="text-slate-300" /></button>
        </div>
        {reason && <p className="border-b border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{reason}</p>}
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black">
          {waiting && !err && <div className="flex items-center gap-2 text-sm text-slate-300"><Spinner size={18} /> Opening the browser...</div>}
          {err && <p className="max-w-xs p-6 text-center text-sm text-slate-300">{err}</p>}
          {frame && frame.open === false && !err && <p className="max-w-xs p-6 text-center text-sm text-slate-300">Nothing is open in the browser right now. When the assistant opens a page, it shows up here.</p>}
          {frame && frame.open && frame.image && <img ref={imgRef} onClick={tap} src={`data:image/jpeg;base64,${frame.image}`} alt="The browser" className="max-h-full w-full cursor-pointer select-none object-contain" draggable={false} />}
        </div>
        {frame && frame.open && (
          <div className="space-y-2 border-t border-white/10 p-2.5">
            <form onSubmit={typeIt} className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tap a box above, then type here" autoComplete="off" autoCapitalize="off" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500" />
              <Tap type="submit" disabled={!text} aria-label="Type it in" className="rounded-xl bg-violet-600 px-3 disabled:opacity-40"><Send size={16} /></Tap>
            </form>
            <div className="flex gap-1.5">
              <Tap onClick={() => send({ op: 'key', key: 'enter' })} aria-label="Press Enter" className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-slate-800 text-xs"><CornerDownLeft size={14} /> Enter</Tap>
              <Tap onClick={() => send({ op: 'key', key: 'backspace' })} aria-label="Delete" className="h-9 flex-1 rounded-lg bg-slate-800 text-xs">Delete</Tap>
              <Tap onClick={() => send({ op: 'key', key: 'tab' })} aria-label="Next box" className="h-9 flex-1 rounded-lg bg-slate-800 text-xs">Tab</Tap>
              <Tap onClick={() => send({ op: 'scroll', dy: -450 })} aria-label="Scroll up" className="flex h-9 w-10 items-center justify-center rounded-lg bg-slate-800"><ArrowUp size={15} /></Tap>
              <Tap onClick={() => send({ op: 'scroll', dy: 450 })} aria-label="Scroll down" className="flex h-9 w-10 items-center justify-center rounded-lg bg-slate-800"><ArrowDown size={15} /></Tap>
              <Tap onClick={() => send({ op: 'back' })} aria-label="Go back" className="flex h-9 w-10 items-center justify-center rounded-lg bg-slate-800"><ArrowLeft size={15} /></Tap>
            </div>
          </div>
        )}
        {onDone && (
          <div className="flex gap-2 border-t border-white/10 p-2.5">
            <Tap onClick={onDone} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold hover:bg-emerald-500"><Check size={16} /> I'm done</Tap>
            <Tap onClick={() => { if (onCant) onCant(); else toast('Closed'); }} className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm hover:bg-slate-700">I can't</Tap>
          </div>
        )}
      </div>
    </div>, document.body);
}
