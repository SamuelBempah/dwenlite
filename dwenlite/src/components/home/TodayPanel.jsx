import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Trash2, Bell, Check, FolderOpen, Sunrise, Circle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { homeCall } from '../../lib/homeClient';
import { Sheet, Spinner, Tap } from './motion';

export const myZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
const when = (t) => new Date(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const localInput = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const inp = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500';

function Section({ icon: Icon, title, children }) {
  return <div className="mt-4 first:mt-0"><h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Icon size={14} /> {title}</h3>{children}</div>;
}

export default function TodayPanel({ onClose, project, onPickProject }) {
  const [d, setD] = useState(null);
  const [todo, setTodo] = useState('');
  const [rem, setRem] = useState({ text: '', at: localInput(Date.now() + 3600000), repeat: 'none' });
  const [proj, setProj] = useState({ name: '', folder: '' });
  const [briefTime, setBriefTime] = useState('07:30');
  const load = useCallback(async () => { try { const r = await homeCall('today_get'); setD(r); if (r.briefing && r.briefing.time) setBriefTime(r.briefing.time); } catch (e) { toast.error(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => { try { await fn(); await load(); } catch (e) { toast.error(e.message); } };
  const addReminder = () => run(async () => {
    if (!rem.text.trim()) return toast.error('What should it say?');
    const at = new Date(rem.at).getTime();
    const r = await homeCall('tool_run', { name: 'reminder', tz: myZone(), args: { action: 'add', text: rem.text, at: rem.at, repeat: rem.repeat } });
    if (/^Error/.test(r.output)) throw new Error(r.output.replace(/^Error: /, ''));
    setRem({ ...rem, text: '', at: localInput(Math.max(at, Date.now()) + 3600000) });
  });

  return (
    <Sheet onClose={onClose} className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 sm:rounded-3xl">
      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Today</h2><button onClick={onClose} aria-label="Close"><X size={22} className="text-slate-400" /></button></div>
        {!d && <div className="flex justify-center py-8"><Spinner size={22} className="text-violet-300" /></div>}
        {d && <>
          <Section icon={Sunrise} title="Morning briefing">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-sm">
              <span className="flex-1 text-slate-300">{d.briefing && d.briefing.enabled ? 'A short summary of your day arrives on your phone each morning.' : 'Get a short summary of your day on your phone each morning.'}</span>
              <input type="time" value={briefTime} onChange={(e) => setBriefTime(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
              <Tap onClick={() => run(async () => { await homeCall('briefing_set', { time: briefTime, tz: myZone() }); toast.success('Briefing set'); })} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold">{d.briefing && d.briefing.enabled ? 'Update' : 'Turn on'}</Tap>
              {d.briefing && d.briefing.enabled && <Tap onClick={() => run(() => homeCall('briefing_set', { enabled: false }))} className="text-xs text-slate-400 hover:text-red-300">Off</Tap>}
            </div>
          </Section>

          <Section icon={Bell} title="Reminders">
            <div className="space-y-1.5">
              {!d.reminders.length && <p className="text-sm text-slate-500">No reminders. You can also just say "remind me to ..." in the chat.</p>}
              {d.reminders.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1"><p className="truncate">{r.text}</p><p className="text-xs text-slate-500">{when(r.at)}{r.repeat && r.repeat !== 'none' ? ` · repeats ${r.repeat}` : ''}</p></div>
                  <button aria-label="Delete reminder" onClick={() => run(() => homeCall('tool_run', { name: 'reminder', args: { action: 'delete', id: r.id } }))} className="text-slate-500 hover:text-red-400"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-2">
              <input value={rem.text} onChange={(e) => setRem({ ...rem, text: e.target.value })} maxLength={300} placeholder="Remind me to..." className={inp} />
              <div className="grid grid-cols-2 gap-2">
                <input type="datetime-local" value={rem.at} onChange={(e) => setRem({ ...rem, at: e.target.value })} className={inp} />
                <select value={rem.repeat} onChange={(e) => setRem({ ...rem, repeat: e.target.value })} className={inp}><option value="none">Once</option><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Every week</option></select>
              </div>
              <Tap onClick={addReminder} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 py-2 text-sm font-semibold"><Plus size={15} /> Add reminder</Tap>
            </div>
          </Section>

          <Section icon={Check} title="To-do list">
            <div className="space-y-1.5">
              {!d.todos.length && <p className="text-sm text-slate-500">Nothing on the list.</p>}
              {d.todos.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm">
                  <button aria-label={t.done ? 'Mark not done' : 'Mark done'} onClick={() => run(() => homeCall('todo_toggle', { id: t.id, done: !t.done }))} className={t.done ? 'text-emerald-400' : 'text-slate-500 hover:text-violet-300'}>{t.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}</button>
                  <span className={`flex-1 ${t.done ? 'text-slate-500 line-through' : ''}`}>{t.text}</span>
                  <button aria-label="Delete" onClick={() => run(() => homeCall('tool_run', { name: 'todo', args: { action: 'delete', id: t.id } }))} className="text-slate-500 hover:text-red-400"><Trash2 size={15} /></button>
                </div>
              ))}
              {d.todos.some((t) => t.done) && <button onClick={() => run(() => homeCall('todo_clear_done'))} className="text-xs text-slate-400 hover:text-slate-200">Clear finished</button>}
            </div>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!todo.trim()) return; const t = todo; setTodo(''); run(() => homeCall('tool_run', { name: 'todo', args: { action: 'add', text: t } })); }}>
              <input value={todo} onChange={(e) => setTodo(e.target.value)} maxLength={300} placeholder="Add something to do" className={inp} />
              <button className="rounded-xl bg-violet-600 px-4 text-sm font-semibold" aria-label="Add to-do"><Plus size={16} /></button>
            </form>
          </Section>

          <Section icon={FolderOpen} title="Projects">
            <p className="mb-2 text-xs text-slate-500">Pick a project and the assistant keeps its notes and folder in mind, and adds to them as you go.</p>
            <div className="space-y-1.5">
              {d.projects.map((p) => (
                <div key={p.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${project && project.id === p.id ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/10 bg-slate-900/60'}`}>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{p.name}</p>{p.folder && <p className="truncate text-xs text-slate-500">{p.folder}</p>}</div>
                  <Tap onClick={() => { onPickProject(project && project.id === p.id ? null : { id: p.id, name: p.name }); }} className="rounded-lg bg-violet-600/80 px-2.5 py-1 text-xs font-semibold">{project && project.id === p.id ? 'Working here' : 'Work on this'}</Tap>
                  <button aria-label="Delete project" onClick={() => run(async () => { await homeCall('project_delete', { id: p.id }); if (project && project.id === p.id) onPickProject(null); })} className="text-slate-500 hover:text-red-400"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <form className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2" onSubmit={(e) => { e.preventDefault(); if (!proj.name.trim()) return; const p = proj; setProj({ name: '', folder: '' }); run(() => homeCall('project_save', p)); }}>
              <input value={proj.name} onChange={(e) => setProj({ ...proj, name: e.target.value })} maxLength={60} placeholder="Project name" className={inp} />
              <input value={proj.folder} onChange={(e) => setProj({ ...proj, folder: e.target.value })} maxLength={300} placeholder="Folder (optional)" className={inp} />
              <button className="rounded-xl bg-violet-600 px-4 text-sm font-semibold" aria-label="Add project"><Plus size={16} /></button>
            </form>
          </Section>
        </>}
      </div>
    </Sheet>
  );
}
