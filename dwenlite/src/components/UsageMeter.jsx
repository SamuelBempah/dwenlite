import { useEffect, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';

const CHARS_PER_SECOND = 14; // rough speaking rate, used to turn characters into minutes

function resetLabel() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const hrs = Math.max(1, Math.ceil((next - now.getTime()) / 3600000));
  const at = new Date(next).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Resets in about ${hrs} hr${hrs === 1 ? '' : 's'} (${at})`;
}

// Small rounded usage bar. Tap it to see the exact percentage used.
export default function UsageMeter({ used = 0, limit = 0, unlimited = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const known = limit > 0 && !unlimited;
  const pct = known ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-blue-500';
  const minutesLeft = known ? Math.max(0, Math.floor((limit - used) / CHARS_PER_SECOND / 60)) : 0;

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Daily usage"
        aria-expanded={open}
        aria-label={unlimited ? 'Voice usage: unlimited' : known ? `Daily voice usage, ${pct}% used` : 'Daily voice usage'}
        className="flex items-center gap-2 rounded-full border border-gray-700 bg-gray-800/80 px-3 py-2 hover:bg-gray-700/80 transition-colors"
      >
        <Gauge size={16} className="text-gray-300 shrink-0" />
        <span className="hidden md:inline text-xs font-medium text-gray-300">{unlimited ? 'Unlimited' : 'Usage'}</span>
        <span className="block h-2 w-14 sm:w-24 overflow-hidden rounded-full bg-gray-700">
          <span
            className={`block h-full rounded-full transition-[width] duration-500 ${color}`}
            style={{ width: `${unlimited ? 100 : known ? Math.max(pct, used > 0 ? 4 : 0) : 0}%`, ...(unlimited ? { background: 'linear-gradient(90deg,#34d399,#60a5fa)' } : {}) }}
          />
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Daily voice usage"
          className="fixed left-4 right-4 top-[4.5rem] z-[70] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64 rounded-2xl border border-gray-700 bg-[#17171c] p-4 shadow-2xl"
        >
          <p className="text-sm font-semibold text-gray-200">Daily voice usage</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {unlimited ? 'Unlimited' : known ? `${pct}%` : '--'} {!unlimited && <span className="text-sm font-medium text-gray-400">used</span>}
          </p>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-700">
            <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-xs text-gray-400">
            {unlimited
              ? 'Admin account: no daily limits on the teacher or its voice.'
              : known
              ? pct >= 100
                ? 'You have reached your free limit for today.'
                : `About ${minutesLeft} min of teacher speech left today.`
              : 'Usage is loading…'}
          </p>
          <p className="mt-1 text-xs text-gray-500">{resetLabel()}</p>
        </div>
      )}
    </div>
  );
}
