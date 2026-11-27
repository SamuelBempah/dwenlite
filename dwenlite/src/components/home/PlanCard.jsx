import { Circle } from 'lucide-react';
import { AnimatePresence, AnimatedCheck, Spinner, motion, Appear, spring } from './motion';

// The assistant's checklist for a bigger job.
export default function PlanCard({ steps: raw, active = false }) {
  // while the task is running, one step is always shown as being worked on
  const steps = active && !raw.some((x) => x.status === 'doing') && raw.some((x) => x.status === 'pending') ? (() => { let hit = false; return raw.map((x) => (!hit && x.status === 'pending' ? ((hit = true), { ...x, status: 'doing' }) : x)); })() : raw;
  const done = steps.filter((s) => s.status === 'done').length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  return (
    <Appear className="my-1.5 max-w-full rounded-2xl border border-violet-500/25 bg-slate-900/70 px-3 py-2.5 text-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-semibold text-slate-100">Plan</p>
        <p className="text-xs text-slate-400">{done} of {steps.length} done</p>
      </div>
      <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-slate-800"><motion.div className="h-full w-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400" style={{ transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: pct / 100 }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></div>
      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <motion.li key={i} className={`flex items-start gap-2 rounded-lg px-1 py-0.5 transition-colors duration-300 ${s.status === 'doing' ? 'bg-violet-500/10' : ''}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: i * 0.05 }}>
            <span className="relative mt-0.5 h-[15px] w-[15px] shrink-0">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span key={s.status} className="absolute inset-0 flex" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}>
                  {s.status === 'done' ? <AnimatedCheck size={15} className="text-emerald-400" /> : s.status === 'doing' ? <Spinner size={15} className="text-violet-300" /> : <Circle size={15} className="text-slate-600" />}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className={`transition-colors duration-300 ${s.status === 'done' ? 'text-slate-500 line-through' : s.status === 'doing' ? 'text-slate-100' : 'text-slate-300'}`}>{s.text}</span>
          </motion.li>
        ))}
      </ul>
    </Appear>
  );
}
