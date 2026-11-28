import { useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import DwenLogo from './DwenLogo';
import { Appear, Collapse, Spinner } from './motion';
import { actionLabel } from './ActionCard';

// On a phone, a run of steps is one tidy line (the latest step and how many there were). Tap it to see them all.
export default function ActionGroup({ items }) {
  const [open, setOpen] = useState(false);
  const running = items.find((i) => i.status === 'running' || i.status === 'asking');
  const last = running || items[items.length - 1];
  const failed = items.filter((i) => i.status === 'error' || i.status === 'denied').length;
  const label = running ? actionLabel(running) : items.length === 1 ? actionLabel(last) : `Did ${items.length} things`;
  return (
    <Appear className="my-1 max-w-[96%] rounded-2xl border border-white/10 bg-slate-900/70 text-sm">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2 text-left">
        <DwenLogo size={24} working={!!running} />
        <span className="min-w-0 flex-1"><span className="block truncate text-slate-100">{label}</span>{items.length > 1 && <span className="block text-[11px] text-slate-500">{running ? `Step ${items.length}` : `${items.length} steps`}{failed ? ` · ${failed} did not work` : ''}</span>}</span>
        {running ? <Spinner size={15} className="text-violet-300" /> : failed && failed === items.length ? <X size={15} className="text-red-400" /> : <Check size={15} className="text-emerald-400" />}
        {items.length > 1 && <ChevronDown size={15} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      <Collapse open={open && items.length > 1}>
        <ul className="space-y-1 border-t border-white/5 px-3 py-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-xs text-slate-300">
              <span className="min-w-0 flex-1 truncate">{actionLabel(i)}</span>
              {i.status === 'running' || i.status === 'asking' ? <Spinner size={12} className="text-violet-300" /> : i.status === 'done' ? <Check size={12} className="text-emerald-400" /> : <X size={12} className="text-red-400" />}
            </li>
          ))}
        </ul>
      </Collapse>
    </Appear>
  );
}
