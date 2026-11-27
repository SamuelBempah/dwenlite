import { useState } from 'react';
import { Monitor, Plus, Trash2, Copy, Download, X, Wifi, WifiOff } from 'lucide-react';
import { HOME_URL, homeCall } from '../../lib/homeClient';
import toast from 'react-hot-toast';

// Pair a computer: create it here, then run the small agent on that computer with the shown command.
export default function DevicePanel({ devices, reload, onClose }) {
  const [name, setName] = useState('');
  const [shell, setShell] = useState(true);
  const [gui, setGui] = useState(true);
  const [made, setMade] = useState(null); // { deviceId, token, name } shown once
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const r = await homeCall('device_create', { name: name.trim() || 'My computer' });
      setMade(r);
      setName('');
      reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Remove "${d.name}"? Its agent will stop working immediately.`)) return;
    try { await homeCall('device_delete', { id: d.id }); reload(); } catch (e) { toast.error(e.message); }
  };
  const command = made
    ? `node dwenlite-agent.mjs --url ${HOME_URL} --device ${made.deviceId} --token ${made.token}${shell ? ' --allow-shell' : ''}${gui ? ' --allow-gui' : ''}`
    : '';
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast.success('Copied'); } catch { toast.error('Copy failed'); } };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 text-white shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Your devices</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X size={22} /></button>
        </div>

        <div className="space-y-2">
          {devices.length === 0 && <p className="text-sm text-slate-400">No devices yet. Add one below, then run the agent on that computer.</p>}
          {devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/70 p-3">
              <Monitor size={20} className="shrink-0 text-violet-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {d.online ? <span className="text-emerald-400"><Wifi size={11} className="mr-1 inline" />online</span> : <span><WifiOff size={11} className="mr-1 inline" />offline</span>}
                  {d.platform ? ` · ${d.platform}` : ''}{d.hostname ? ` · ${d.hostname}` : ''}
                  {d.online ? ` · shell ${d.caps && d.caps.shell ? 'on' : 'off'} · screen ${d.caps && d.caps.gui ? 'on' : 'off'}` : ''}
                </p>
              </div>
              <button onClick={() => remove(d)} aria-label={`Remove ${d.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <p className="mb-2 text-sm font-semibold">Add a computer</p>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name, e.g. Desk PC" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
            <button onClick={create} disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50"><Plus size={16} /> Add</button>
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <label className="flex items-start gap-2"><input type="checkbox" checked={shell} onChange={(e) => setShell(e.target.checked)} className="mt-1 accent-violet-500" /><span>Allow running commands <span className="text-slate-500">(you still approve each one)</span></span></label>
            <label className="flex items-start gap-2"><input type="checkbox" checked={gui} onChange={(e) => setGui(e.target.checked)} className="mt-1 accent-violet-500" /><span>Allow screenshots, mouse and keyboard <span className="text-slate-500">(screenshots are read by the image model)</span></span></label>
          </div>
        </div>

        {made && (
          <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm">
            <p className="font-semibold text-amber-200">"{made.name}" is ready. Now, on that computer:</p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-slate-300">
              <li>Install <a className="text-violet-300 underline" href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a> (version 18 or newer).</li>
              <li><a className="inline-flex items-center gap-1 text-violet-300 underline" href="/dwenlite-agent.mjs" download="dwenlite-agent.mjs"><Download size={13} /> Download dwenlite-agent.mjs</a> into a folder.</li>
              <li>Open a terminal in that folder and run:
                <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-black/50 p-2.5 font-mono text-xs text-slate-200">{command}</pre>
                <button onClick={() => copy(command)} className="mt-1 flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200"><Copy size={13} /> Copy command</button>
              </li>
            </ol>
            <p className="mt-3 text-xs text-amber-200/80">The key in that command is shown only once. Keep the agent running while you want Dwenlite Home to use this computer. It works inside a folder called "dwenlite-home" in your user folder, and logs everything it does there.</p>
          </div>
        )}
      </div>
    </div>
  );
}
