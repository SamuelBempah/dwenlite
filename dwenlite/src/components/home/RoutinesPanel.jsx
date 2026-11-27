import { useEffect, useState } from 'react';
import { X, Play, CloudCog, Pencil, Trash2, Plus, Clock, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { homeCall } from '../../lib/homeClient';
import { Collapse, Sheet, Spinner, Tap, motion, spring } from './motion';

const describe = (s, t) => (t ? (t.kind === 'file' ? `When a file ${t.pattern ? `(${t.pattern}) ` : ''}appears in ${t.folder}` : t.kind === 'online' ? 'When the computer comes online' : 'When its link is called') : !s ? 'Only when you run it' : s.kind === 'interval' ? `Every ${s.everyMinutes} minutes` : s.kind === 'weekdays' ? `Weekdays at ${s.time}` : `Every day at ${s.time}`);
const ago = (t) => { if (!t) return 'never'; const s = Math.max(1, Math.round((Date.now() - t) / 1000)); if (s < 60) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} d ago`; };
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

function Editor({ draft, devices, onCancel, onSaved }) {
  const [f, setF] = useState({ name: '', prompt: '', deviceId: '', when: 'none', time: '08:00', every: 60, allowActions: false, watch: false, enabled: true, ...draft });
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const save = async () => {
    setBusy(true);
    try {
      const trig = ['file', 'online', 'hook'].includes(f.when) ? { kind: f.when, folder: f.folder || '', pattern: f.pattern || '' } : null;
      const schedule = trig || f.when === 'none' ? null : f.when === 'interval' ? { kind: 'interval', everyMinutes: Number(f.every) } : { kind: f.when, time: f.time, tz: tz() };
      const out = await homeCall('routine_save', { id: f.id, name: f.name, prompt: f.prompt, deviceId: f.deviceId, schedule, allowActions: f.allowActions, watch: f.watch, enabled: f.enabled, trigger: trig, newLink: !!f.newLink });
      toast.success('Saved'); if (out.hookUrl) { setLink(out.hookUrl); return; } onSaved();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const inp = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500';
  if (link) return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold">Your private link</p>
      <p className="text-xs text-slate-400">Anything that can open or call this link will start the routine: a bookmark, a phone shortcut, or a service like IFTTT, Zapier or GitHub webhooks. Keep it private. This is the only time it is shown.</p>
      <p className="break-all rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs">{link}</p>
      <div className="flex gap-2"><Tap onClick={async () => { try { await navigator.clipboard.writeText(link); toast.success('Copied'); } catch { toast.error('Press and hold the link to copy it.'); } }} className="flex-1 rounded-xl bg-violet-600 py-2.5 font-semibold">Copy link</Tap><Tap onClick={onSaved} className="rounded-xl bg-slate-800 px-4 py-2.5">Done</Tap></div>
    </div>
  );
  return (
    <div className="space-y-3 text-sm">
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} placeholder="Name, e.g. Morning check" className={inp} />
      <textarea value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} rows={4} maxLength={2000} placeholder="What should it do? Write it like you would in the chat." className={`${inp} resize-none`} />
      <div className="grid grid-cols-2 gap-2">
        <select value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} className={inp}>
          <option value="none">Only when I run it</option><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="interval">Every few minutes</option><option value="file">When a file appears</option><option value="online">When my computer comes online</option><option value="hook">When a link is called</option>
        </select>
        {['file', 'online', 'hook'].includes(f.when) ? <div className={`${inp} flex items-center text-xs text-slate-400`}>{f.when === 'file' ? 'Watches a folder' : f.when === 'online' ? 'Runs once it is back' : 'Gives you a private link'}</div> : f.when === 'interval'
          ? <select value={f.every} onChange={(e) => setF({ ...f, every: e.target.value })} className={inp}>{[15, 30, 60, 120, 360, 720, 1440].map((n) => <option key={n} value={n}>{n >= 60 ? `${n / 60} h` : `${n} min`}</option>)}</select>
          : <input type="time" value={f.time} disabled={f.when === 'none'} onChange={(e) => setF({ ...f, time: e.target.value })} className={`${inp} disabled:opacity-40`} />}
      </div>
      {f.when === 'file' && <div className="grid grid-cols-2 gap-2"><input value={f.folder || ''} onChange={(e) => setF({ ...f, folder: e.target.value })} placeholder="Folder, e.g. ~Downloads" className={inp} /><input value={f.pattern || ''} onChange={(e) => setF({ ...f, pattern: e.target.value })} placeholder="Only names like *.pdf (optional)" className={inp} /><p className="col-span-2 text-xs text-slate-500">The folder must be one the computer is allowed to use (see the folder icon under Your computers). Pick the computer below.</p></div>}
      {f.when === 'hook' && f.id && <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={!!f.newLink} onChange={(e) => setF({ ...f, newLink: e.target.checked })} className="accent-violet-500" /> Make a new link (the old one stops working)</label>}
      <select value={f.deviceId} onChange={(e) => setF({ ...f, deviceId: e.target.value })} className={inp}>
        <option value="">Any computer that is online</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
        <input type="checkbox" checked={f.allowActions} onChange={(e) => setF({ ...f, allowActions: e.target.checked })} className="mt-1 accent-violet-500" />
        <span><b>Allow it to change things</b><span className="block text-xs text-slate-400">Off by default: when you are not there it can only read, look and search. Turn this on to let it make changes on your computer by itself. Dangerous things stay blocked.</span></span>
      </label>
      <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
        <input type="checkbox" checked={f.watch} onChange={(e) => setF({ ...f, watch: e.target.checked })} className="mt-1 accent-violet-500" />
        <span><b>Watch mode: only tell me when something changes</b><span className="block text-xs text-slate-400">It checks on schedule and stays quiet (no notification) unless there is something new since the last check. Good for "tell me when this page changes".</span></span>
      </label>
      <p className="text-xs text-slate-500">Scheduled runs happen on our server every few minutes, so the time can be a few minutes late. Your computer must be on, with the agent running, for anything that uses it. You get a notification when a run finishes (turn it on in Settings).</p>
      <div className="flex gap-2">
        <Tap onClick={save} disabled={busy || !f.name.trim() || !f.prompt.trim()} className="flex-1 rounded-xl bg-violet-600 py-2.5 font-semibold hover:bg-violet-500 disabled:opacity-40">{busy ? 'Saving...' : 'Save routine'}</Tap>
        <Tap onClick={onCancel} className="rounded-xl bg-slate-800 px-4 py-2.5 hover:bg-slate-700">Cancel</Tap>
      </div>
    </div>
  );
}

// Saved tasks you can run again, on a schedule or on demand.
export default function RoutinesPanel({ devices, draft, onClose, onRunHere }) {
  const [list, setList] = useState(null);
  const [runs, setRuns] = useState([]);
  const [edit, setEdit] = useState(draft ? { ...draft } : null);
  const [busyId, setBusyId] = useState('');
  const [open, setOpen] = useState({});
  const load = () => { homeCall('routine_list').then((r) => setList(r.routines)).catch((e) => toast.error(e.message)); homeCall('run_list').then((r) => setRuns(r.runs)).catch(() => {}); };
  useEffect(load, []);

  const runBg = async (r) => {
    setBusyId(r.id);
    try { const out = await homeCall('routine_run', { id: r.id }); toast.success(out.status === 'error' ? 'It ran into a problem.' : 'Finished. See the result below.'); } catch (e) { toast.error(e.message); } finally { setBusyId(''); load(); }
  };
  const toggle = async (r) => { try { await homeCall('routine_save', { id: r.id, name: r.name, prompt: r.prompt, deviceId: r.deviceId, schedule: r.schedule, trigger: r.trigger, allowActions: r.allowActions, watch: r.watch, enabled: !r.enabled }); load(); } catch (e) { toast.error(e.message); } };
  const del = async (r) => { if (!window.confirm(`Delete "${r.name}"?`)) return; try { await homeCall('routine_delete', { id: r.id }); load(); } catch (e) { toast.error(e.message); } };
  const startEdit = (r) => setEdit({ id: r.id, name: r.name, prompt: r.prompt, deviceId: r.deviceId, allowActions: r.allowActions, watch: r.watch, enabled: r.enabled, when: r.trigger ? r.trigger.kind : r.schedule ? r.schedule.kind : 'none', folder: r.trigger && r.trigger.folder, pattern: r.trigger && r.trigger.pattern, time: (r.schedule && r.schedule.time) || '08:00', every: (r.schedule && r.schedule.everyMinutes) || 60 });

  return (
    <Sheet onClose={onClose} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 text-white shadow-2xl sm:rounded-3xl">
      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Routines</h2><button onClick={onClose} aria-label="Close"><X size={22} className="text-slate-400" /></button></div>
        {edit ? <Editor draft={edit} devices={devices} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} /> : (
          <>
            <p className="mb-3 text-xs text-slate-400">Save a task once, then run it with one tap or let it run by itself on a schedule.</p>
            {!list && <p className="animate-pulse text-sm text-slate-400">Loading...</p>}
            {list && list.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No routines yet. Create one, or finish a task in the chat and tap "Save as routine".</p>}
            <ul className="space-y-2">
              {(list || []).map((r, i) => (
                <motion.li key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 8) * 0.04 }} className={`rounded-2xl border bg-slate-900/60 p-3 text-sm transition-colors ${r.enabled ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><Clock size={11} />{describe(r.schedule, r.trigger)}{r.once ? ' (one time)' : ''}{r.watch ? ' · watching for changes' : ''}{r.allowActions ? ' · can change things' : ''}</p>
                    </div>
                    <button onClick={() => toggle(r)} role="switch" aria-checked={r.enabled} aria-label={`${r.enabled ? 'Pause' : 'Resume'} ${r.name}`} className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${r.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}><motion.span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white" animate={{ x: r.enabled ? 16 : 0 }} transition={spring} /></button>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-300">{r.prompt}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Tap onClick={() => onRunHere(r.prompt)} className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold hover:bg-violet-500"><Play size={12} /> Run in chat</Tap>
                    <Tap onClick={() => runBg(r)} disabled={!!busyId} className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-50">{busyId === r.id ? <Spinner size={12} /> : <CloudCog size={12} />} In the background</Tap>
                    <button onClick={() => startEdit(r)} aria-label={`Edit ${r.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><Pencil size={14} /></button>
                    <button onClick={() => del(r)} aria-label={`Delete ${r.name}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={14} /></button>
                    {r.lastRun > 0 && <button onClick={() => setOpen((p) => ({ ...p, [r.id]: !p[r.id] }))} className="ml-auto flex items-center text-xs text-slate-400 hover:text-slate-200">Last run {ago(r.lastRun)} <motion.span animate={{ rotate: open[r.id] ? 180 : 0 }} transition={spring} style={{ display: 'inline-flex' }}><ChevronDown size={12} /></motion.span></button>}
                  </div>
                  <Collapse open={!!open[r.id]}><p className={`mt-2 whitespace-pre-wrap rounded-lg bg-black/40 p-2.5 text-xs ${r.lastStatus === 'error' ? 'text-red-200' : 'text-slate-300'}`}>{r.lastText || 'No result saved.'}</p></Collapse>
                </motion.li>
              ))}
            </ul>
            <Tap onClick={() => setEdit({})} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-violet-500/40 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/10"><Plus size={16} /> New routine</Tap>
            {runs.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent runs</p>
                <ul className="space-y-1.5">{runs.slice(0, 8).map((r) => (
                  <li key={r.id} className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-xs"><div className="flex justify-between gap-2"><span className="font-semibold text-slate-200">{r.name}</span><span className="text-slate-500">{ago(r.finishedAt)}</span></div><p className={`mt-1 line-clamp-3 whitespace-pre-wrap ${r.status === 'error' ? 'text-red-200' : 'text-slate-400'}`}>{r.text}</p></li>
                ))}</ul>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
