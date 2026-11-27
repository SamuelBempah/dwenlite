import { useState } from 'react';
import { ShieldQuestion, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { homeCall } from '../../lib/homeClient';
import { Appear, Tap } from './motion';
import { plainText } from '../../lib/homePlain';

// The assistant needs a yes or no before doing something risky.
export default function AskCard({ item }) {
  const [sending, setSending] = useState(false);
  const answer = async (yes) => { setSending(true); try { await homeCall('approval_answer', { id: item.id, yes }); } catch (e) { toast.error(e.message); setSending(false); } };
  const done = item.answer && item.answer !== 'waiting';
  return (
    <Appear className={`my-1.5 max-w-full rounded-2xl border px-3 py-2.5 text-sm ${done ? 'border-white/10 bg-slate-900/60' : 'border-amber-400/40 bg-amber-500/10'}`}>
      <div className="flex items-start gap-2.5">
        <ShieldQuestion size={20} className={`mt-0.5 shrink-0 ${done ? 'text-slate-500' : 'text-amber-300'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-slate-100">{plainText(item.question)}</p>
          {done ? <p className="mt-1 text-xs text-slate-400">{item.answer === 'yes' ? 'You said yes.' : item.answer === 'no' ? 'You said no.' : item.answer === 'stopped' ? 'Stopped.' : 'No answer in time, so it did not go ahead.'}</p> : (
            <div className="mt-2 flex gap-2">
              <Tap onClick={() => answer(true)} disabled={sending} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50"><Check size={14} /> Approve</Tap>
              <Tap onClick={() => answer(false)} disabled={sending} className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3.5 py-1.5 text-xs font-semibold hover:bg-slate-600 disabled:opacity-50"><X size={14} /> Not now</Tap>
            </div>
          )}
        </div>
      </div>
    </Appear>
  );
}
