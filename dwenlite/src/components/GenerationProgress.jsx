import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';

// Progress card shown while notes, quizzes or flashcards are being created.
export default function GenerationProgress({ progress }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!progress) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [progress?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!progress) return null;
  const { title, steps, step, pct, detail, indeterminate } = progress;
  const secs = Math.max(0, Math.floor((now - progress.startedAt) / 1000));
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const done = pct >= 100;

  return (
    <div
      role="progressbar"
      aria-label={title}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950/70 p-5 shadow-xl shadow-purple-950/40 md:p-6"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-purple-600/20 blur-3xl" />

      <div className="relative flex items-center gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${done ? 'bg-green-500/20 text-green-300' : 'bg-purple-500/20 text-purple-200'}`}>
          {done ? <Check size={22} /> : <Sparkles size={22} className="animate-pulse" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-white">{title}</p>
          <p className="text-sm text-slate-400 break-words">{detail}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold tabular-nums leading-none text-white">{Math.round(pct)}<span className="text-lg text-slate-400">%</span></p>
          <p className="mt-1 text-xs tabular-nums text-slate-500">{elapsed}</p>
        </div>
      </div>

      <div className="relative mt-5 h-3 w-full overflow-hidden rounded-full bg-slate-700/60">
        <div
          className={`relative h-full rounded-full ${done ? 'bg-green-500' : 'bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500'} transition-[width] duration-500 ease-out`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        >
          {!done && <span className="gen-sheen absolute inset-0" />}
        </div>
        {indeterminate && !done && <span className="gen-stripe absolute inset-y-0 w-1/4 rounded-full bg-white/25" />}
      </div>

      <ol className="relative mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {steps.map((label, i) => {
          const state = i < step ? 'done' : i === step && !done ? 'active' : done ? 'done' : 'todo';
          return (
            <li key={label} className={`flex items-center gap-2 ${state === 'todo' ? 'text-slate-500' : state === 'active' ? 'text-white' : 'text-green-300'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${state === 'done' ? 'bg-green-500/25' : state === 'active' ? 'bg-purple-500/40' : 'bg-slate-700'}`}>
                {state === 'done' ? <Check size={12} /> : state === 'active' ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : i + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
