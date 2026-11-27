import { useEffect, useState } from 'react';
import { X, AlertCircle, Ban, ChevronDown } from 'lucide-react';
import { AnimatedCheck, Collapse, Sheet, Spinner, motion, spring } from './motion';
import { homeCall } from '../../lib/homeClient';

const LABEL = { shell: 'Ran a task', read_file: 'Read a file', write_file: 'Saved a file', list_dir: 'Looked through a folder', system_info: 'Checked the computer', screenshot: 'Looked at the screen', click: 'Clicked', type_text: 'Typed', press_key: 'Pressed keys', scroll: 'Scrolled', open_url: 'Opened a link', list_windows: 'Checked open programs', show_home: 'Came back here', browser: 'Used the browser', undo: 'Undid a change' };
const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} d ago`; };

// Everything the assistant did on your computers recently. Technical details are folded away.
export default function ActivityPanel({ devices, onClose }) {
  const [jobs, setJobs] = useState(null);
  const [open, setOpen] = useState({});
  const [err, setErr] = useState('');
  useEffect(() => { homeCall('job_list').then((r) => setJobs(r.jobs || [])).catch((e) => setErr(e.message)); }, []);
  const dev = (id) => (devices.find((d) => d.id === id) || {}).name || '';
  const visible = (jobs || []).filter((j) => j.type !== 'show_home');
  return (
    <Sheet onClose={onClose} className="max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 text-white shadow-2xl sm:rounded-3xl">
      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">What it did recently</h2><button onClick={onClose} aria-label="Close"><X size={22} className="text-slate-400" /></button></div>
        {err && <p className="text-sm text-red-300">{err}</p>}
        {!jobs && !err && <p className="animate-pulse text-sm text-slate-400">Loading...</p>}
        {jobs && visible.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nothing yet. Actions on your computers show up here for 3 days.</p>}
        <ul className="space-y-1.5">
          {visible.map((j, i) => (
            <motion.li key={j.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 12) * 0.03 }} className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                {j.status === 'done' ? <AnimatedCheck size={15} className="shrink-0 text-emerald-400" /> : j.status === 'error' ? <AlertCircle size={15} className="shrink-0 text-red-400" /> : j.status === 'cancelled' ? <Ban size={15} className="shrink-0 text-slate-500" /> : <Spinner size={15} className="shrink-0 text-violet-300" />}
                <span className="min-w-0 flex-1 truncate">{j.summary || LABEL[j.type] || j.type}</span>
                <span className="shrink-0 text-xs text-slate-500">{ago(j.createdAt)}</span>
                {j.detail && <button onClick={() => setOpen((p) => ({ ...p, [j.id]: !p[j.id] }))} aria-expanded={!!open[j.id]} className="flex shrink-0 items-center text-xs text-slate-400 hover:text-slate-200">Details <motion.span animate={{ rotate: open[j.id] ? 180 : 0 }} transition={spring} style={{ display: 'inline-flex' }}><ChevronDown size={12} /></motion.span></button>}
              </div>
              <Collapse open={!!open[j.id]}><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-2 font-mono text-xs text-slate-300">{`${LABEL[j.type] || j.type}${dev(j.deviceId) ? ` on ${dev(j.deviceId)}` : ''}\n${j.detail}`}</pre></Collapse>
            </motion.li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
