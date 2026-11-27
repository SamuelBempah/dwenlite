import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, ArrowUp, ArrowDown, CornerDownLeft, Send, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { watchLive } from '../../lib/homeLive';
import { Spinner, Tap } from './motion';

// The assistant's private browser (or the computer's screen) live on this screen.
// In the browser you can tap, type and scroll, for example to sign in to an account. What you type goes straight to the browser and is never kept.
export default function BrowserView({ device, kind = 'browser', reason, onClose, onDone, onCant }) {
  const isScreen = kind === 'screen';
  const [frame, setFrame] = useState(null); // { image, w, h, title, url, open }
  const [err, setErr] = useState('');
  const [slow, setSlow] = useState(false);
  const [text, setText] = useState('');
  const live = useRef(null); const imgRef = useRef(null); const metaRef = useRef(null);

  useEffect(() => {
    const w = watchLive({
      deviceId: device.id, kind,
      onFrame: (r) => { metaRef.current = r.meta; setSlow(false); setErr(''); setFrame({ ...r.meta, image: r.image || '' }); },
      onWaiting: (ms, n) => { if (n >= 2) setSlow(true); },
      onError: (m) => setErr(m),
    });
    live.current = w;
    return () => w.stop();
  }, [device.id, kind]);

  const send = (op) => live.current && live.current.input(op);
  const tap = (e) => {
    const m = metaRef.current; if (isScreen || !m || !m.w || !imgRef.current) return;
    const r = imgRef.current.getBoundingClientRect();
    send({ op: 'tap', x: Math.round(((e.clientX - r.left) / r.width) * m.w), y: Math.round(((e.clientY - r.top) / r.height) * m.h) });
  };
  const typeIt = (e) => { e.preventDefault(); if (!text) return; send({ op: 'text', text }); setText(''); };
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const showing = frame && frame.open && frame.image;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/90 p-3 sm:p-6" role="dialog" aria-label={isScreen ? 'Screen' : 'Browser'}>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121217] text-white">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{isScreen ? device.name : (frame && frame.open ? (frame.title || host(frame.url) || 'Browser') : 'Browser')}</p><p className="truncate text-[11px] text-slate-400">{isScreen ? 'Screen' : frame && frame.open ? host(frame.url) : device.name}</p></div>
          {showing && <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold tracking-wide"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE</span>}
          <button onClick={onClose} aria-label="Close"><X size={22} className="text-slate-300" /></button>
        </div>
        {reason && <p className="border-b border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{reason}</p>}
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
          {!frame && !err && <div className="flex flex-col items-center gap-2 px-6 text-center text-sm text-slate-300"><span className="flex items-center gap-2"><Spinner size={18} /> {isScreen ? 'Connecting to the screen...' : 'Opening the browser...'}</span>{slow && <span className="text-xs text-slate-500">Taking longer than usual. Is the computer on and connected? If this stays, restart Dwenlite on that computer so it can update.</span>}</div>}
          {err && <p className="max-w-xs p-6 text-center text-sm text-slate-300">{err}</p>}
          {frame && !frame.open && !err && <p className="max-w-xs p-6 text-center text-sm text-slate-300">{isScreen ? (frame.error ? 'The screen could not be shown.' : 'The screen is not available right now.') : 'Nothing is open in the browser right now. When the assistant opens a page, it shows up here.'}</p>}
          {showing && <img ref={imgRef} onClick={tap} src={`data:image/jpeg;base64,${frame.image}`} alt={isScreen ? 'The screen' : 'The browser'} className={`max-h-full w-full select-none object-contain ${isScreen ? '' : 'cursor-pointer'}`} draggable={false} />}
        </div>
        {!isScreen && frame && frame.open && (
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
