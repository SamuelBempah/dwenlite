import { Fragment, useEffect, useState } from 'react';
import { auth } from '../firebase';

const URL = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';
const fmt = (n) => (n || 0).toLocaleString();

// AI usage per day (admin only). The server checks your email, this page only displays the numbers.
export default function AdminUsage() {
  const [state, setState] = useState({ loading: true, days: [], error: '' });
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) { setState({ loading: false, days: [], error: 'Please sign in.' }); return; }
      try {
        const token = await user.getIdToken();
        const res = await fetch(URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ task: 'admin_stats' })
        });
        const j = await res.json();
        if (!res.ok) throw new Error(res.status === 403 ? 'This page is only for admins.' : `${j.error || 'Could not load usage.'}${j.detail ? ' (' + j.detail + ')' : ''}`);
        setState({ loading: false, days: j.days || [], error: '' });
      } catch (err) {
        setState({ loading: false, days: [], error: err.message });
      }
    });
    return unsub;
  }, []);

  const tasksOf = (d) => [...new Set(Object.keys(d).filter(k => k.endsWith('_req')).map(k => k.slice(0, -4)))];
  const sum = (d, suffix) => tasksOf(d).reduce((a, t) => a + (d[`${t}_${suffix}`] || 0), 0);
  const days = state.days.map(d => {
    const prompt = sum(d, 'prompt');
    const hit = sum(d, 'hit');
    return { ...d, req: sum(d, 'req'), prompt, hit, out: sum(d, 'out'), hitPct: prompt ? Math.round((hit / prompt) * 100) : 0 };
  });
  const total = days.reduce((a, d) => ({ req: a.req + d.req, prompt: a.prompt + d.prompt, hit: a.hit + d.hit, out: a.out + d.out }), { req: 0, prompt: 0, hit: 0, out: 0 });

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8 text-white">
      <h1 className="text-2xl font-bold">AI usage</h1>
      <p className="mt-1 text-sm text-slate-400">Last 14 days. Input tokens that hit the cache are cheaper, so a higher cache % means lower cost.</p>

      {state.loading && <p className="mt-6 animate-pulse text-slate-400">Loading...</p>}
      {state.error && <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{state.error}</p>}

      {!state.loading && !state.error && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Requests', fmt(total.req)],
              ['Input tokens', fmt(total.prompt)],
              ['Cache hit', total.prompt ? `${Math.round((total.hit / total.prompt) * 100)}%` : '--'],
              ['Output tokens', fmt(total.out)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-slate-800/50 p-3">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="mt-1 text-xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-slate-800/70 text-xs text-slate-400">
                <tr><th className="p-3">Day (UTC)</th><th className="p-3">Requests</th><th className="p-3">Input</th><th className="p-3">Cache</th><th className="p-3">Output</th></tr>
              </thead>
              <tbody>
                {days.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">No data yet. It fills in as people use the AI.</td></tr>}
                {days.map(d => (
                  <Fragment key={d.day}>
                    <tr onClick={() => setOpen(open === d.day ? null : d.day)} className="cursor-pointer border-t border-white/5 hover:bg-white/5">
                      <td className="p-3 font-medium">{d.day}</td><td className="p-3">{fmt(d.req)}</td><td className="p-3">{fmt(d.prompt)}</td><td className="p-3">{d.hitPct}%</td><td className="p-3">{fmt(d.out)}</td>
                    </tr>
                    {open === d.day && tasksOf(d).map(t => (
                      <tr key={d.day + t} className="bg-slate-900/60 text-xs text-slate-300">
                        <td className="p-2 pl-6">{t}</td><td className="p-2">{fmt(d[`${t}_req`])}</td><td className="p-2">{fmt(d[`${t}_prompt`])}</td>
                        <td className="p-2">{d[`${t}_prompt`] ? Math.round(((d[`${t}_hit`] || 0) / d[`${t}_prompt`]) * 100) : 0}%</td><td className="p-2">{fmt(d[`${t}_out`])}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">Tap a day to see which features used the tokens.</p>
        </>
      )}
    </div>
  );
}
