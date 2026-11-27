import { Check, Loader2, Circle } from 'lucide-react';

// The assistant's checklist for a bigger job.
export default function PlanCard({ steps }) {
  const done = steps.filter((s) => s.status === 'done').length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  return (
    <div className="my-1.5 max-w-full rounded-2xl border border-violet-500/25 bg-slate-900/70 px-3 py-2.5 text-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-semibold text-slate-100">Plan</p>
        <p className="text-xs text-slate-400">{done} of {steps.length} done</p>
      </div>
      <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} /></div>
      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">
              {s.status === 'done' ? <Check size={15} className="text-emerald-400" /> : s.status === 'doing' ? <Loader2 size={15} className="animate-spin text-violet-300" /> : <Circle size={15} className="text-slate-600" />}
            </span>
            <span className={s.status === 'done' ? 'text-slate-500 line-through' : s.status === 'doing' ? 'text-slate-100' : 'text-slate-300'}>{s.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
