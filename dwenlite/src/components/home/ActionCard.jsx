import { useState } from 'react';
import { Terminal, FileText, FilePen, FolderOpen, Cpu, Camera, MousePointerClick, Keyboard, Globe, Code2, Check, X, Loader2, ChevronDown, ScrollText } from 'lucide-react';

const META = {
  run_shell: { icon: Terminal, doing: 'Running a task on the computer', done: 'Ran a task on the computer' },
  read_file: { icon: FileText, doing: 'Reading a file', done: 'Read a file' },
  write_file: { icon: FilePen, doing: 'Saving a file', done: 'Saved a file' },
  list_dir: { icon: FolderOpen, doing: 'Looking through a folder', done: 'Looked through a folder' },
  system_info: { icon: Cpu, doing: 'Checking the computer', done: 'Checked the computer' },
  screenshot: { icon: Camera, doing: 'Looking at the screen', done: 'Looked at the screen' },
  click: { icon: MousePointerClick, doing: 'Clicking', done: 'Clicked' },
  type_text: { icon: Keyboard, doing: 'Typing', done: 'Typed' },
  press_key: { icon: Keyboard, doing: 'Pressing keys', done: 'Pressed keys' },
  scroll: { icon: ScrollText, doing: 'Scrolling', done: 'Scrolled' },
  open_url: { icon: Globe, doing: 'Opening a link', done: 'Opened a link' },
  run_js: { icon: Code2, doing: 'Running a quick calculation', done: 'Ran a quick calculation' },
};

function detail(name, a) {
  switch (name) {
    case 'run_shell': return a.command;
    case 'read_file': case 'list_dir': return a.path || '.';
    case 'write_file': return `${a.append ? 'Append to' : 'Write'} ${a.path}\n\n${String(a.content || '').slice(0, 600)}${String(a.content || '').length > 600 ? '\n...' : ''}`;
    case 'screenshot': return a.look;
    case 'click': return `${a.double ? 'Double-click' : 'Click'} ${a.button === 'right' ? '(right button) ' : ''}at ${a.x}, ${a.y}`;
    case 'type_text': return a.text;
    case 'press_key': return a.keys;
    case 'scroll': return `${a.direction} ${a.amount || 5}`;
    case 'open_url': return a.url;
    case 'run_js': return a.code;
    default: return '';
  }
}

// One action the assistant takes: a plain one-line description, with the technical parts tucked under "Details".
export default function ActionCard({ item, onDecide }) {
  const asking = item.status === 'asking';
  const [open, setOpen] = useState(false);
  const meta = META[item.tool] || { icon: Terminal, doing: 'Working', done: 'Done' };
  const Icon = meta.icon;
  const d = detail(item.tool, item.args || {});
  const said = item.args && typeof item.args.summary === 'string' ? item.args.summary.trim() : '';
  const finished = item.status === 'done' || item.status === 'error' || item.status === 'denied';
  const label = said || (finished ? meta.done : meta.doing);
  const showDetails = open || asking;
  const hasMore = !!(d || item.output || item.image);
  const color = item.status === 'error' || item.status === 'denied' ? 'border-red-500/30' : item.status === 'done' ? 'border-emerald-500/20' : asking ? 'border-amber-400/50' : 'border-white/10';

  return (
    <div className={`my-1.5 max-w-full rounded-2xl border ${color} bg-slate-900/70 px-3 py-2 text-sm`}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300"><Icon size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-slate-100">{asking ? `Wants to: ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label}</p>
          {item.status === 'running' && <p className="truncate text-xs text-slate-500">{item.note || 'Working on it...'}</p>}
          {item.status === 'denied' && <p className="text-xs text-red-300">You said no to this.</p>}
          {item.status === 'error' && <p className="text-xs text-red-300">That did not work.</p>}
        </div>
        {item.status === 'running' && <Loader2 size={15} className="animate-spin text-violet-300" />}
        {item.status === 'done' && <Check size={15} className="text-emerald-400" />}
        {(item.status === 'error' || item.status === 'denied') && <X size={15} className="text-red-400" />}
        {hasMore && !asking && (
          <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs text-slate-400 hover:text-slate-200">
            Details <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {asking && (
        <div className="mt-2 flex gap-2">
          <button onClick={() => onDecide(item.id, true)} className="flex-1 rounded-xl bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-500">Allow</button>
          <button onClick={() => onDecide(item.id, false)} className="flex-1 rounded-xl bg-slate-700 py-2 font-semibold text-slate-200 hover:bg-slate-600">No</button>
        </div>
      )}

      {showDetails && hasMore && (
        <div className="mt-2 space-y-2" data-testid="action-details">
          {item.deviceName && <p className="text-xs text-slate-500">On {item.deviceName}</p>}
          {d && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-2.5 font-mono text-xs text-slate-200">{d}</pre>}
          {item.image && <img src={`data:image/jpeg;base64,${item.image}`} alt="Screenshot" className="max-h-64 rounded-lg border border-white/10" />}
          {item.output && !asking && <pre className={`max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-2.5 font-mono text-xs ${item.status === 'error' ? 'text-red-200' : 'text-slate-300'}`}>{item.output}</pre>}
        </div>
      )}
    </div>
  );
}
