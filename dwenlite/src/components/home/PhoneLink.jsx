import { useRef, useState } from 'react';
import { ClipboardPaste, ClipboardCopy, FileUp, FileDown, ExternalLink, Lock, Moon, VolumeX, Volume1, Volume2, Play, SkipForward, SkipBack, Smartphone } from 'lucide-react';
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
