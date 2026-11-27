import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, ArrowRight, RotateCw, Lock, Globe, Check } from 'lucide-react';
import { watchLive } from '../../lib/homeLive';
import { Spinner, Tap } from './motion';

const SENT = '​​'; // the hidden typing box always holds two invisible marks, so a Backspace on any keyboard is noticed
const SPECIAL = { Enter: 'enter', Backspace: 'backspace', Tab: 'tab', Escape: 'escape', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end', Delete: 'delete', PageDown: 'pagedown', PageUp: 'pageup' };

// The assistant's private browser (or the computer's screen) live on this screen, used like a normal browser:
// tap to click, drag to scroll, and type on your keyboard. What you type goes straight to the browser and is never kept.
export default function BrowserView({ device, kind = 'browser', reason, onClose, onDone }) {
  const isScreen = kind === 'screen';
  const [frame, setFrame] = useState(null); // { image, w, h, title, url, open, editable }
  const [err, setErr] = useState('');
  const [slow, setSlow] = useState(false);
  const [addr, setAddr] = useState('');
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false); const live = useRef(null); const imgRef = useRef(null); const metaRef = useRef(null); const typeRef = useRef(null);
  const drag = useRef(null); const composing = useRef(false);

  useEffect(() => {
    const w = watchLive({
      deviceId: device.id, kind,
      onFrame: (r) => { metaRef.current = r.meta; if (r.meta && r.meta.url) setAddr((a0) => (editingRef.current ? a0 : r.meta.url)); setSlow(false); setErr(''); setFrame({ ...r.meta, image: r.image || '' }); },
      onWaiting: (ms, n) => { if (n >= 2) setSlow(true); },
      onError: (m) => setErr(m),
    });
    live.current = w;
    return () => w.stop();
  }, [device.id, kind]);

  // the on-screen keyboard only stays up while the page has a box to type in
  useEffect(() => { if (frame && frame.open && frame.editable === false && typeRef.current && document.activeElement === typeRef.current) typeRef.current.blur(); }, [frame]);

  const send = (op) => live.current && live.current.input(op);
  const toPage = (e) => { const m = metaRef.current; const r = imgRef.current && imgRef.current.getBoundingClientRect(); if (!m || !m.w || !r || !r.width) return null; return { x: Math.round(((e.clientX - r.left) / r.width) * m.w), y: Math.round(((e.clientY - r.top) / r.height) * m.h), scale: m.w / r.width }; };
  const resetTyper = () => { const t = typeRef.current; if (t) { t.value = SENT; try { t.setSelectionRange(SENT.length, SENT.length); } catch { /* ignore */ } } };

  // one finger or the mouse: a short touch is a click, a drag scrolls the page
  const down = (e) => { if (isScreen) return; drag.current = { x: e.clientX, y: e.clientY, last: e.clientY, moved: false }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) d.moved = true;
    if (d.moved) { const p = toPage(e); const dy = Math.round((d.last - e.clientY) * (p ? p.scale : 1)); if (Math.abs(dy) >= 12) { send({ op: 'scroll', dy }); d.last = e.clientY; } }
  };
  const up = (e) => {
    const d = drag.current; drag.current = null; if (!d || d.moved) return;
    const p = toPage(e); if (p) send({ op: 'tap', x: p.x, y: p.y });
    if (typeRef.current) { resetTyper(); typeRef.current.focus({ preventScroll: true }); }
  };
  const wheel = (e) => { if (isScreen) return; send({ op: 'scroll', dy: Math.round(e.deltaY) }); };

  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing || composing.current) return;
    const special = SPECIAL[e.key];
    if (special) { e.preventDefault(); send({ op: 'key', key: (e.shiftKey && special === 'tab') ? 'shift+tab' : special }); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.length === 1 && 'acxzy'.includes(e.key.toLowerCase())) { e.preventDefault(); send({ op: 'key', key: `ctrl+${e.key.toLowerCase()}` }); }
  };
  const onPaste = (e) => { const t = e.clipboardData && e.clipboardData.getData('text'); if (t) { e.preventDefault(); send({ op: 'text', text: t }); } };
  const onInput = (e) => {
    if (composing.current) return;
    const v = e.target.value; const marks = (v.match(/​/g) || []).length;
    const typed = v.replace(/​/g, '');
    for (let i = marks; i < SENT.length; i++) send({ op: 'key', key: 'backspace' });
    if (typed) send({ op: 'text', text: typed });
    resetTyper();
  };
  const onCompEnd = (e) => { composing.current = false; if (e.data) send({ op: 'text', text: e.data }); resetTyper(); };

  const showing = frame && frame.open && frame.image;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" role="dialog" aria-label={isScreen ? 'Screen' : 'Browser'}>
      {isScreen ? (
        <div className="flex items-center gap-2 border-b border-white/10 bg-[#1a1a22] px-3 py-2 text-white">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{device.name}</p><p className="truncate text-[11px] text-slate-400">Screen</p></div>
          {showing && <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold tracking-wide"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE</span>}
          <button onClick={onClose} aria-label="Close"><X size={22} className="text-slate-300" /></button>
        </div>
      ) : (
        <div className="flex items-center gap-1 border-b border-white/10 bg-[#1a1a22] px-2 py-1.5 text-white">
          <Tap onClick={() => send({ op: 'back' })} aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"><ArrowLeft size={16} /></Tap>
          <Tap onClick={() => send({ op: 'forward' })} aria-label="Forward" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"><ArrowRight size={16} /></Tap>
          <Tap onClick={() => send({ op: 'reload' })} aria-label="Reload" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"><RotateCw size={15} /></Tap>
          <form className="min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); if (addr.trim()) { send({ op: 'go', url: addr.trim() }); editingRef.current = false; setEditing(false); e.target.querySelector('input').blur(); } }}>
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950 px-3 py-1.5">
              {frame && frame.url && /^https:/i.test(frame.url) ? <Lock size={12} className="shrink-0 text-emerald-400" /> : <Globe size={12} className="shrink-0 text-slate-500" />}
              <input value={editing ? addr : (frame && frame.open ? (frame.url || '') : '')} onFocus={(e) => { editingRef.current = true; setEditing(true); e.target.select(); }} onBlur={() => { editingRef.current = false; setEditing(false); if (frame && frame.url) setAddr(frame.url); }} onChange={(e) => setAddr(e.target.value)} placeholder="Search or type a web address" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-600" />
            </div>
          </form>
          {onDone && <Tap onClick={onDone} className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-500"><Check size={14} /> Done</Tap>}
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10"><X size={18} className="text-slate-300" /></button>
        </div>
      )}
      {reason && <p className="border-b border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">{reason}</p>}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black text-white">
        {!frame && !err && <div className="flex flex-col items-center gap-2 px-6 text-center text-sm text-slate-300"><span className="flex items-center gap-2"><Spinner size={18} /> {isScreen ? 'Connecting to the screen...' : 'Opening the browser...'}</span>{slow && <span className="text-xs text-slate-500">Taking longer than usual. Is the computer on and connected? If this stays, restart Dwenlite on that computer so it can update.</span>}</div>}
        {err && <p className="max-w-xs p-6 text-center text-sm text-slate-300">{err}</p>}
        {frame && !frame.open && !err && <p className="max-w-xs p-6 text-center text-sm text-slate-300">{isScreen ? (frame.error ? 'The screen could not be shown.' : 'The screen is not available right now.') : 'Nothing is open in the browser right now. Type a web address above, or wait for the assistant to open a page.'}</p>}
        {showing && <img ref={imgRef} src={`data:image/jpeg;base64,${frame.image}`} alt={isScreen ? 'The screen' : 'The browser'} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} onWheel={wheel} className="h-full w-full select-none object-contain" style={{ touchAction: 'none', cursor: isScreen ? 'default' : 'pointer' }} draggable={false} />}
        {!isScreen && <textarea ref={typeRef} defaultValue={SENT} onKeyDown={onKeyDown} onInput={onInput} onPaste={onPaste} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={onCompEnd} aria-label="Type into the page" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="pointer-events-none absolute bottom-0 left-0 h-6 w-6 opacity-0" />}
      </div>
    </div>, document.body);
}
