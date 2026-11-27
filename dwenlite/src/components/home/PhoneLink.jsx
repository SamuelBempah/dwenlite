import { useRef, useState } from 'react';
import { Folder, File as FileIcon, ChevronLeft, ClipboardPaste, ClipboardCopy, FileUp, FileDown, ExternalLink, Lock, Moon, VolumeX, Volume1, Volume2, Play, SkipForward, SkipBack, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { homeCall } from '../../lib/homeClient';
import { uploadPieces, downloadPieces, MAX_FILE } from '../../lib/homeFiles';
import { sleep } from '../../lib/homeTimer';
import { Spinner, Tap } from './motion';

const inp = 'min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500';

// Everything the phone can do with the computer in one tap: clipboard, files, links and basic controls.
export default function PhoneLink({ devices }) {
  const online = devices.filter((d) => d.online);
  const [devId, setDevId] = useState('');
  const dev = online.find((d) => d.id === devId) || online[0];
  const [busy, setBusy] = useState('');
  const [text, setText] = useState('');
  const [got, setGot] = useState('');
  const [url, setUrl] = useState('');
  const [path, setPath] = useState('');
  const fileRef = useRef(null);
  const [dir, setDir] = useState(null); // { path, entries, loading, error }
  if (!online.length) return null;

  const job = async (type, args, summary) => {
    const { id } = await homeCall('job_create', { deviceId: dev.id, type, args, summary });
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const j = await homeCall('job_get', { id });
      if (j.status === 'done') return { id, out: j.result || '' };
      if (j.status === 'error' || j.status === 'cancelled') throw new Error(String(j.result || 'The computer could not do that.').replace(/^Error:\s*/, ''));
    }
    throw new Error('The computer did not answer. Is it on and connected?');
  };
  const doing = async (key, fn, ok) => { setBusy(key); try { const r = await fn(); if (ok) toast.success(typeof ok === 'function' ? ok(r) : ok); } catch (e) { toast.error(e.message); } finally { setBusy(''); } };
  const pasteFromPhone = async () => { try { const t = await navigator.clipboard.readText(); if (t) setText(t); else toast('Nothing copied on this phone.'); } catch { toast.error('Allow pasting for this site, or type it in the box.'); } };
  const browse = async (p) => {
    setDir({ path: p, entries: [], loading: true });
    try {
      const r = await job('list_dir', { path: p }, 'Looking through a folder');
      const lines = r.out.split('\n'); const real = lines[0].trim();
      const entries = lines.slice(1).map((l) => /^(dir |file)\s+(\d*)\s+(\S+)\s+(.*)$/.exec(l)).filter(Boolean).map((m) => ({ dir: m[1].trim() === 'dir', size: Number(m[2]) || 0, name: m[4] }));
      setDir({ path: real || p, entries: entries.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name)) });
    } catch (e) { setDir({ path: p, entries: [], error: e.message }); }
  };
  const joinPath = (base, name) => `${base.replace(/[\\/]+$/, '')}${base.includes('\\') ? '\\' : '/'}${name}`;
  const parentOf = (p) => { const m = /^(.*)[\\/][^\\/]+[\\/]?$/.exec(p); return m && m[1] ? m[1] : null; };
  const fetchFile = (full) => doing('fd', async () => { const r = await job('send_file', { path: full }, 'Getting a file'); const m = /\[file:([\w-]+):(\d+):(\d+)\]/.exec(r.out); if (!m) throw new Error('That file could not be sent (up to 8 MB).'); await downloadPieces(m[1], Number(m[2]), full.split(/[\\/]/).pop()); }, 'Downloaded to this phone');
  const control = (action, label) => doing(action, () => job('pc_control', { action }, label));
  const Btn = ({ icon: Icon, label, onClick, k }) => <Tap onClick={onClick} disabled={!!busy} aria-label={label} title={label} className="flex h-10 flex-1 items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40">{busy === k ? <Spinner size={15} /> : <Icon size={17} />}</Tap>;

  return (
    <div className="mt-5">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Smartphone size={13} /> Phone and computer</p>
      <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-sm">
        {online.length > 1 && <select value={dev.id} onChange={(e) => setDevId(e.target.value)} className={inp + ' w-full flex-none'}>{online.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}

        <div>
          <p className="mb-1.5 text-xs text-slate-400">Copy between them{online.length === 1 ? ` (${dev.name})` : ''}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={20000} placeholder="Text to put on the computer's clipboard" className={inp + ' w-full resize-none'} />
          <div className="mt-1.5 flex gap-2">
            <Tap onClick={pasteFromPhone} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"><ClipboardPaste size={14} /> Paste from phone</Tap>
            <Tap onClick={() => text.trim() && doing('cw', () => job('clipboard', { action: 'write', text }, 'Copying to the computer'), 'Copied to the computer. Paste it there.')} disabled={!text.trim() || !!busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold hover:bg-violet-500 disabled:opacity-40">{busy === 'cw' ? <Spinner size={14} /> : <ClipboardCopy size={14} />} Send to computer</Tap>
          </div>
          <Tap onClick={() => doing('cr', async () => { const r = await job('clipboard', { action: 'read' }, 'Reading the clipboard'); setGot(r.out); })} disabled={!!busy} className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40">{busy === 'cr' ? <Spinner size={14} /> : <ClipboardCopy size={14} />} Get what is copied on the computer</Tap>
          {got && <div className="mt-1.5 rounded-xl border border-white/10 bg-slate-950 p-2.5"><p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs text-slate-200">{got}</p><Tap onClick={async () => { try { await navigator.clipboard.writeText(got); toast.success('Copied on this phone'); } catch { toast.error('Press and hold the text to copy it.'); } }} className="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold">Copy on phone</Tap></div>}
        </div>

        <div>
          <p className="mb-1.5 text-xs text-slate-400">Files</p>
          <input ref={fileRef} type="file" hidden multiple onChange={(e) => { const files = [...e.target.files]; e.target.value = ''; files.forEach((f) => doing('fu', async () => { if (f.size > MAX_FILE) throw new Error(`${f.name} is too big (8 MB at most).`); const { fileId, total } = await uploadPieces(f); const r = await job('fetch_file', { fileId, name: f.name, total, folder: 'uploads' }, 'Receiving a file'); return r.out; }, (o) => `${f.name} is on the computer${/Saved (.+?) \(/.exec(o || '') ? `: ${/Saved (.+?) \(/.exec(o)[1]}` : ''}`)); }} />
          <Tap onClick={() => fileRef.current && fileRef.current.click()} disabled={!!busy} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40">{busy === 'fu' ? <Spinner size={14} /> : <FileUp size={14} />} Send a file or photo to the computer</Tap>
          <form className="mt-1.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); const p = path.trim(); if (!p) return; doing('fd', async () => { const r = await job('send_file', { path: p }, 'Getting a file'); const m = /\[file:([\w-]+):(\d+):(\d+)\]/.exec(r.out); if (!m) throw new Error('That file could not be sent (up to 8 MB).'); await downloadPieces(m[1], Number(m[2]), p.split(/[\\/]/).pop()); }, 'Downloaded to this phone'); }}>
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="Get a file from the computer, like Documents/report.docx" className={inp} />
            <Tap type="submit" disabled={!path.trim() || !!busy} aria-label="Get the file" className="rounded-xl bg-slate-800 px-3 hover:bg-slate-700 disabled:opacity-40">{busy === 'fd' ? <Spinner size={15} /> : <FileDown size={16} />}</Tap>
          </form>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{[['Work folder', '.'], ['Documents', '~Documents'], ['Desktop', '~Desktop'], ['Downloads', '~Downloads'], ['Pictures', '~Pictures']].map(([n, p]) => <Tap key={n} onClick={() => browse(p)} disabled={!!busy} className="flex items-center gap-1 rounded-full border border-white/10 bg-slate-800 px-2.5 py-1 text-xs hover:border-violet-500/50 disabled:opacity-40"><Folder size={12} /> {n}</Tap>)}</div>
          {dir && (
            <div className="mt-2 rounded-xl border border-white/10 bg-slate-950 p-2">
              <div className="mb-1 flex items-center gap-2"><button aria-label="Up one folder" disabled={!parentOf(dir.path)} onClick={() => browse(parentOf(dir.path))} className="rounded p-1 text-slate-300 hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={16} /></button><p className="min-w-0 flex-1 truncate text-xs text-slate-400" title={dir.path}>{dir.path}</p><button aria-label="Close the list" onClick={() => setDir(null)} className="text-xs text-slate-500 hover:text-slate-200">Close</button></div>
              {dir.loading && <div className="flex justify-center py-4"><Spinner size={18} className="text-violet-300" /></div>}
              {dir.error && <p className="px-1 py-2 text-xs text-red-300">{/outside the folders/i.test(dir.error) ? 'It does not have access to that folder yet. Add it under Your computers, then the folder icon.' : dir.error}</p>}
              <div className="max-h-56 overflow-y-auto">{(dir.entries || []).map((e) => (
                <button key={e.name} onClick={() => (e.dir ? browse(joinPath(dir.path, e.name)) : fetchFile(joinPath(dir.path, e.name)))} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/10">
                  {e.dir ? <Folder size={14} className="shrink-0 text-violet-300" /> : <FileIcon size={14} className="shrink-0 text-slate-500" />}<span className="min-w-0 flex-1 truncate">{e.name}</span>{!e.dir && <span className="shrink-0 text-slate-500">{e.size >= 1048576 ? (e.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(e.size / 1024)) + ' KB'}</span>}
                </button>))}
                {!dir.loading && !dir.error && !(dir.entries || []).length && <p className="px-2 py-2 text-xs text-slate-500">Empty.</p>}</div>
              <p className="mt-1 px-1 text-[11px] text-slate-500">Tap a folder to open it, or a file to download it here.</p>
            </div>
          )}
          <p className="mt-1 text-[11px] text-slate-500">Not sure where a file is? Ask in the chat: "find my tax invoice and send it to me".</p>
        </div>

        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const u = url.trim(); if (!/^https?:\/\//i.test(u)) { toast.error('Start the link with http:// or https://'); return; } doing('ou', () => job('open_url', { url: u }, 'Opening a link'), 'Opened on the computer').then(() => setUrl('')); }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Open a link on the computer" className={inp} />
          <Tap type="submit" disabled={!url.trim() || !!busy} aria-label="Open on the computer" className="rounded-xl bg-slate-800 px-3 hover:bg-slate-700 disabled:opacity-40">{busy === 'ou' ? <Spinner size={15} /> : <ExternalLink size={16} />}</Tap>
        </form>

        <div>
          <p className="mb-1.5 text-xs text-slate-400">Controls</p>
          <div className="flex gap-1.5">
            <Btn k="lock" icon={Lock} label="Lock the computer" onClick={() => control('lock', 'Locking')} />
            <Btn k="sleep" icon={Moon} label="Put it to sleep" onClick={() => window.confirm('Put the computer to sleep? It will go offline until someone wakes it.') && control('sleep', 'Sleeping')} />
            <Btn k="mute" icon={VolumeX} label="Mute" onClick={() => control('mute', 'Muting')} />
            <Btn k="volume_down" icon={Volume1} label="Volume down" onClick={() => control('volume_down', 'Volume')} />
            <Btn k="volume_up" icon={Volume2} label="Volume up" onClick={() => control('volume_up', 'Volume')} />
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <Btn k="previous" icon={SkipBack} label="Previous track" onClick={() => control('previous', 'Music')} />
            <Btn k="play_pause" icon={Play} label="Play or pause" onClick={() => control('play_pause', 'Music')} />
            <Btn k="next" icon={SkipForward} label="Next track" onClick={() => control('next', 'Music')} />
          </div>
        </div>
      </div>
    </div>
  );
}
