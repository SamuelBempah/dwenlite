import { Fragment, useEffect, useState } from 'react';
import { Monitor, Plus, Trash2, Copy, Download, X, Wifi, WifiOff, FolderOpen } from 'lucide-react';
import { HOME_URL, homeCall } from '../../lib/homeClient';
import toast from 'react-hot-toast';
import { Sheet } from './motion';

// Pair a computer: create it here, then run the small agent on that computer with the shown command.
export default function DevicePanel({ devices, reload, onClose }) {
  const [name, setName] = useState('');
  const [shell, setShell] = useState(true);
  const [gui, setGui] = useState(true);
  const [made, setMade] = useState(null); // { deviceId, token, name } shown once
  const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState(null); // { code, until }
  const [now, setNow] = useState(Date.now());
  const [foldersFor, setFoldersFor] = useState(null);
  const [folderText, setFolderText] = useState('');
  const saveFolders = async (d) => {
    try { await homeCall('device_update', { id: d.id, folders: folderText.split('\n') }); toast.success('Saved. The computer picks it up within seconds.'); setFoldersFor(null); reload(); } catch (e) { toast.error(e.message); }
  };

  const create = async () => {
    setBusy(true);
    try {
      const r = await homeCall('device_create', { name: name.trim() || 'My computer' });
      setMade(r);
      setName('');
      reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const getCode = async () => {
    setBusy(true);
    try { const r = await homeCall('pair_code_create', { name: name.trim() || 'My computer', shell, gui }); setPair({ code: r.code, until: Date.now() + r.expiresInMinutes * 60000 }); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { if (!pair) return undefined; const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, [pair]);
  const reconnect = async (d) => {
    setBusy(true);
    try { const r = await homeCall('device_rotate', { id: d.id }); setMade(r); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Remove "${d.name}"? Its agent will stop working immediately.`)) return;
    try { await homeCall('device_delete', { id: d.id }); reload(); } catch (e) { toast.error(e.message); }
  };
  const command = made
    ? `node dwenlite-agent.mjs --url ${HOME_URL} --device ${made.deviceId} --token ${made.token}${shell ? ' --allow-shell' : ''}${gui ? ' --allow-gui' : ''}`
    : '';
  const winCommand = made
    ? `Invoke-WebRequest -UseBasicParsing ${window.location.origin}/dwenlite-start.ps1 -OutFile $HOME\\dwenlite-start.ps1; powershell -ExecutionPolicy Bypass -File $HOME\\dwenlite-start.ps1 -Device ${made.deviceId} -Token ${made.token} -Install${shell ? '' : ' -NoShell'}${gui ? '' : ' -NoGui'}`
    : '';
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast.success('Copied'); } catch { toast.error('Copy failed'); } };

  return (
    <Sheet onClose={onClose} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 text-white shadow-2xl sm:rounded-3xl">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Your devices</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X size={22} /></button>
        </div>

        <div className="space-y-2">
          {devices.length === 0 && <p className="text-sm text-slate-400">No devices yet. Add one below, then run the agent on that computer.</p>}
          {devices.map((d) => (
            <Fragment key={d.id}>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/70 p-3">
              <Monitor size={20} className="shrink-0 text-violet-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {d.online ? <span className="text-emerald-400"><Wifi size={11} className="mr-1 inline" />online{d.locked ? ' (screen locked)' : ''}</span> : <span><WifiOff size={11} className="mr-1 inline" />offline</span>}
                  {d.platform ? ` · ${d.platform}` : ''}{d.hostname ? ` · ${d.hostname}` : ''}
                  {d.online ? ` · shell ${d.caps && d.caps.shell ? 'on' : 'off'} · screen ${d.caps && d.caps.gui ? 'on' : 'off'}` : ''}
                </p>
              </div>
              {!d.online && <button onClick={() => reconnect(d)} disabled={busy} className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold hover:bg-violet-500 disabled:opacity-50">Reconnect</button>}
              <button onClick={() => { setFoldersFor(foldersFor === d.id ? null : d.id); setFolderText((d.folders || []).join('\n')); }} aria-label={`Folders for ${d.name}`} title="Folders it may use" className="rounded-lg p-2 text-slate-500 hover:bg-white/10 hover:text-slate-200"><FolderOpen size={16} /></button>
              <button onClick={() => remove(d)} aria-label={`Remove ${d.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={16} /></button>
            </div>
            {foldersFor === d.id && (
              <div className="-mt-1 rounded-xl border border-white/10 bg-slate-900/50 p-3 text-xs">
                <p className="mb-1.5 font-semibold text-slate-200">Folders it may read and change</p>
                <p className="mb-2 text-slate-400">It always has its own work folder. Add full paths here (one per line) to let it use other folders too, for example C:\Users\you\Documents\Projects. File actions are limited to these. Commands run through the shell cannot be fully fenced, but dangerous ones (wiping disks, shutting down, running downloaded code) are always blocked.</p>
                <div className="mb-2 flex flex-wrap gap-1.5">{['Documents', 'Desktop', 'Downloads', 'Pictures'].map((n) => <button key={n} type="button" onClick={() => setFolderText((t) => (t.split('\n').includes('~' + n) ? t : (t.trim() ? t.trim() + '\n' : '') + '~' + n))} className="rounded-full border border-white/10 bg-slate-800 px-2.5 py-1 text-slate-200 hover:border-violet-500/50">+ {n}</button>)}</div>
                <textarea value={folderText} onChange={(e) => setFolderText(e.target.value)} rows={3} placeholder="C:\\Users\\you\\Documents\\Projects" className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono outline-none focus:border-violet-500" />
                <button onClick={() => saveFolders(d)} className="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 font-semibold hover:bg-violet-500">Save</button>
              </div>
            )}
            </Fragment>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
          <p className="mb-1 text-sm font-semibold">Add a Windows computer (easiest)</p>
          <p className="mb-3 text-xs text-slate-400">Install Dwenlite on that computer and connect it with a short code. No commands to type and nothing to copy.</p>
          {(!pair || pair.until < now) && <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name for this computer, e.g. Work laptop" className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500" />}
          {!pair || pair.until < now
            ? <button onClick={getCode} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50"><Plus size={16} /> {pair ? 'That code expired. Get a new one' : 'Get a code'}</button>
            : (
              <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-black/40 py-3 text-center"><p className="font-mono text-3xl font-bold tracking-[0.25em] text-white" data-testid="pair-code">{pair.code.slice(0, 4)}-{pair.code.slice(4)}</p><p className="mt-1 text-xs text-slate-400">Works once, for {Math.max(1, Math.ceil((pair.until - now) / 60000))} more minutes</p></div>
                <ol className="list-decimal space-y-1.5 pl-5 text-slate-300">
                  <li><a href="/Dwenlite-Setup.exe" download className="inline-flex items-center gap-1 font-semibold text-violet-300 underline"><Download size={14} /> Download Dwenlite for Windows</a> on that computer and open it.</li>
                  <li>If Windows says "Windows protected your PC", tap <b>More info</b>, then <b>Run anyway</b>. (The app is new, so Windows has not seen it before.)</li>
                  <li>At the end of the installer it asks for the code. Type the code above there. That is all.</li>
                </ol>
                <p className="text-xs text-slate-500">It runs quietly in the background, starts when you sign in, keeps itself up to date, and shows a small icon near the clock. Press Ctrl+Alt+D there to ask Dwenlite something from anywhere.</p>
              </div>
            )}
        </div>

        <details className="mt-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-300">Mac, Linux, or set it up by hand</summary>
        <div className="mt-3">
          <p className="mb-2 text-sm font-semibold">Add a computer</p>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name, e.g. Desk PC" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
            <button onClick={create} disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50"><Plus size={16} /> Add</button>
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <label className="flex items-start gap-2"><input type="checkbox" checked={shell} onChange={(e) => setShell(e.target.checked)} className="mt-1 accent-violet-500" /><span>Allow it to run tasks on this computer</span></label>
            <label className="flex items-start gap-2"><input type="checkbox" checked={gui} onChange={(e) => setGui(e.target.checked)} className="mt-1 accent-violet-500" /><span>Allow it to see and use the screen</span></label>
          </div>
        </div>
        </details>

        {made && (
          <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm">
            <p className="font-semibold text-amber-200">"{made.name}" is ready. On that computer:</p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-slate-300">
              <li>Already installed Node.js and downloaded the agent before? Skip to the last step.</li>
              <li>Install <a className="text-violet-300 underline" href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a> (version 18 or newer).</li>
              <li><a className="inline-flex items-center gap-1 text-violet-300 underline" href="/dwenlite-agent.mjs" download="dwenlite-agent.mjs"><Download size={13} /> Download dwenlite-agent.mjs</a> into a folder.</li>
              <li><b>Windows, easiest:</b> open PowerShell and paste this. It downloads the newest agent, restarts it if it stops, and (with the last line) starts it by itself when you sign in:
                <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-black/50 p-2.5 font-mono text-xs text-slate-200">{winCommand}</pre>
                <button onClick={() => copy(winCommand)} className="mt-1 flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200"><Copy size={13} /> Copy Windows command</button>
              </li>
              <li>Mac or Linux: open a terminal in the folder that holds dwenlite-agent.mjs and run:
                <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-black/50 p-2.5 font-mono text-xs text-slate-200">{command}</pre>
                <button onClick={() => copy(command)} className="mt-1 flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200"><Copy size={13} /> Copy command</button>
              </li>
            </ol>
            <p className="mt-3 text-xs text-amber-200/80">To let Home sign in to websites for you without ever seeing your passwords, save a login on that computer: run <span className="font-mono">node dwenlite-agent.mjs vault add</span> there. The password stays encrypted on that computer. </p>
            <p className="mt-2 text-xs text-amber-200/80">The key in that command is shown only once and replaces the old one (the old command stops working). If the agent disconnects later, open Your devices and press Reconnect. Keep the agent running while you want Dwenlite Home to use this computer. It works inside a folder called "dwenlite-home" in your user folder, and logs everything it does there.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
