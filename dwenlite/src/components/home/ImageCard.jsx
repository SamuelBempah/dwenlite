import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Maximize2, X } from 'lucide-react';
import { Appear, Tap } from './motion';
import { plainText } from '../../lib/homePlain';

// A picture the owner asked to see (a screenshot of their screen or of a page). Tap to see it big; it can be saved.
export default function ImageCard({ item }) {
  const [big, setBig] = useState(false);
  const src = `data:image/jpeg;base64,${item.image}`;
  const save = () => { const a = document.createElement('a'); a.href = src; a.download = `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`; document.body.appendChild(a); a.click(); a.remove(); };
  return (
    <Appear className="my-1.5 max-w-[96%] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 sm:max-w-[70%]">
      <button onClick={() => setBig(true)} aria-label="Show the picture bigger" className="block w-full bg-black"><img src={src} alt={plainText(item.caption) || 'Screenshot'} className="max-h-[50dvh] w-full object-contain" /></button>
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
        <span className="min-w-0 flex-1 truncate">{plainText(item.caption) || 'Screenshot'}{item.deviceName ? ` · ${item.deviceName}` : ''}</span>
        <Tap onClick={() => setBig(true)} aria-label="Bigger" className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 hover:bg-slate-700"><Maximize2 size={12} /> Open</Tap>
        <Tap onClick={save} aria-label="Save the picture" className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 hover:bg-slate-700"><Download size={12} /> Save</Tap>
      </div>
      {big && createPortal(
        <div className="fixed inset-0 z-[95] flex flex-col bg-black/95" onClick={() => setBig(false)}>
          <div className="flex items-center justify-end gap-3 p-3 text-white"><Tap onClick={(e) => { e.stopPropagation(); save(); }} className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs"><Download size={14} /> Save</Tap><button onClick={() => setBig(false)} aria-label="Close"><X size={24} /></button></div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2"><img src={src} alt="" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full object-contain" /></div>
        </div>, document.body)}
    </Appear>
  );
}
