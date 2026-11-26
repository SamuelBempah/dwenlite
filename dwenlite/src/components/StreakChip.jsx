import { useEffect, useRef, useState } from 'react';
import { Flame, Check, Lock } from 'lucide-react';
import { BADGES, effectiveCount, localDay, useStreak } from '../lib/streak';

// Flame + day count. Tap for badges and what is next.
export default function StreakChip() {
  const streak = useStreak();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const count = effectiveCount(streak);
  const doneToday = streak.last === localDay();
  const next = BADGES.find(b => b.days > count);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Study streak: ${count} days`}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-800/80 px-3 py-1.5 hover:border-orange-500/50 transition-colors"
      >
        <Flame size={14} className={doneToday ? 'text-orange-400' : 'text-slate-500'} fill={doneToday ? 'currentColor' : 'none'} />
        <span className="text-sm font-bold text-white">{count}</span>
      </button>

      {open && (
        <div className="fixed left-4 right-4 top-[4.5rem] z-[70] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 rounded-2xl border border-white/10 bg-[#17171c] p-4 text-white shadow-2xl">
          <p className="text-sm font-semibold text-gray-200">Study streak</p>
          <p className="mt-1 text-3xl font-bold">{count} <span className="text-sm font-medium text-gray-400">day{count === 1 ? '' : 's'}</span></p>
          <p className="mt-1 text-xs text-gray-400">
            {doneToday ? 'You studied today. Come back tomorrow to keep it going.' : 'Do a lesson, quiz or flashcards today to keep your streak.'}
          </p>
          <p className="mt-1 text-xs text-gray-500">Best: {streak.best} day{streak.best === 1 ? '' : 's'}</p>
          <ul className="mt-3 space-y-1.5">
            {BADGES.map(b => {
              const earned = streak.best >= b.days;
              return (
                <li key={b.days} className={`flex items-center gap-2 text-sm ${earned ? 'text-white' : 'text-gray-500'}`}>
                  {earned ? <Check size={14} className="text-green-400" /> : <Lock size={14} />}
                  <span className="flex-1">{b.name}</span>
                  <span className="text-xs">{b.days} days</span>
                </li>
              );
            })}
          </ul>
          {next && <p className="mt-3 text-xs text-gray-400">{next.days - count} more day{next.days - count === 1 ? '' : 's'} to "{next.name}".</p>}
        </div>
      )}
    </div>
  );
}
