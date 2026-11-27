import { useState } from 'react';
import { FileText, FolderOpen, ExternalLink, Download, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { homeCall } from '../../lib/homeClient';
import { downloadPieces } from '../../lib/homeFiles';
import { sleep } from '../../lib/homeTimer';
import { Spinner, Tap } from './motion';

const base = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p;
const folderOf = (p) => { const m = /^(.*)[\\/][^\\/]+$/.exec(String(p)); return m ? m[1] : ''; };

// A file the assistant made or found: where it is, and one tap to show it on the computer, open it, or get a copy on this device.
export default function FileCard({ path, deviceId, deviceName, fileMeta }) {
  const [busy, setBusy] = useState('');
  const job = async (type, args, summary) => {
    const { id } = await homeCall('job_create', { deviceId, type, args, summary });
    for (let i = 0; i < 40; i++) {
      await sleep(900);
      const j = await homeCall('job_get', { id });
      if (j.status === 'done') return j.result || '';
      if (j.status === 'error' || j.status === 'cancelled') throw new Error(String(j.result || 'The computer could not do that.').replace(/^Error:\s*/, ''));
    }
    throw new Error('The computer did not answer. Is it on and connected?');
  };
  const run = async (key, fn, ok) => { setBusy(key); try { await fn(); if (ok) toast.success(ok); } catch (e) { toast.error(e.message); } finally { setBusy(''); } };
  const get = () => run('dl', async () => {
    if (fileMeta) { await downloadPieces(fileMeta.jobId, fileMeta.total, fileMeta.name); return; }
    const out = await job('send_file', { path }, 'Getting a file'); const m = /\[file:([\w-]+):(\d+):(\d+)\]/.exec(out);
    if (!m) throw new Error('That file is too big to send (8 MB at most). Use "Show on computer".');
    await downloadPieces(m[1], Number(m[2]), base(path));
  }, 'Downloaded to this device');
  const B = ({ k, icon: Icon, label, onClick, primary }) => <Tap onClick={onClick} disabled={!!busy || !deviceId} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${primary ? 'bg-violet-600 hover:bg-violet-500' : 'bg-slate-800 hover:bg-slate-700'}`}>{busy === k ? <Spinner size={13} /> : <Icon size={13} />} {label}</Tap>;
  return (
    <div className="mt-2 rounded-xl border border-violet-500/25 bg-violet-500/5 p-2.5">
      <div className="flex items-start gap-2.5">
        <FileText size={20} className="mt-0.5 shrink-0 text-violet-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100">{base(path)}</p>
          <p className="break-all text-xs text-slate-400">{folderOf(path) ? `${deviceName ? deviceName + ': ' : ''}${folderOf(path)}` : deviceName}</p>
        </div>
        <button aria-label="Copy the location" title="Copy the location" onClick={async () => { try { await navigator.clipboard.writeText(path); toast.success('Location copied'); } catch { toast.error('Press and hold the location to copy it.'); } }} className="shrink-0 rounded p-1 text-slate-500 hover:text-slate-200"><Copy size={14} /></button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <B k="show" icon={FolderOpen} label="Show on computer" primary onClick={() => run('show', () => job('reveal_file', { path, mode: 'show' }, 'Showing a file'), 'Shown on the computer')} />
        <B k="open" icon={ExternalLink} label="Open" onClick={() => run('open', () => job('reveal_file', { path, mode: 'open' }, 'Opening a file'), 'Opened on the computer')} />
        <B k="dl" icon={Download} label="Download here" onClick={get} />
      </div>
    </div>
  );
}
