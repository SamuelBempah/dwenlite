import { useState } from 'react';
import { Terminal, FileText, FilePen, FolderOpen, Cpu, Camera, MousePointerClick, Keyboard, Globe, Code2, Check, X, Loader2, ChevronDown, ScrollText, Search, Undo2, Compass, Smartphone, Network } from 'lucide-react';

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
  browser: { icon: Compass, doing: 'Working in the browser', done: 'Used the browser' },
  android: { icon: Smartphone, doing: 'Working on the phone', done: 'Used the phone' },
  network_scan: { icon: Network, doing: 'Looking for devices on the network', done: 'Scanned the network' },
  lan_http: { icon: Network, doing: 'Talking to a device on the network', done: 'Talked to a device on the network' },
  web_search: { icon: Search, doing: 'Searching the web', done: 'Searched the web' },
  read_page: { icon: Globe, doing: 'Reading a web page', done: 'Read a web page' },
  list_windows: { icon: Cpu, doing: 'Checking which programs are open', done: 'Checked which programs are open' },
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
    case 'browser': return [a.action, a.url || (a.element ? `element ${a.element}` : ''), a.text ? `"${String(a.text).slice(0, 200)}"` : '', a.keys || '', a.look || ''].filter(Boolean).join(' ');
    case 'android': return [a.action, a.serial || '', a.host || '', a.element ? `element ${a.element}` : '', a.text ? `"${String(a.text).slice(0, 200)}"` : '', a.key || '', a.package || a.url || '', a.command || '', a.local || '', a.remote || ''].filter(Boolean).join(' ');
    case 'network_scan': return (a.ports || []).join(', ');
    case 'lan_http': return `${a.method || 'GET'} ${a.url}${a.body ? '\n' + String(a.body).slice(0, 300) : ''}`;
    case 'web_search': return a.query;
    case 'read_page': return a.url;
    case 'run_js': return a.code;
    default: return '';
  }
}

// One action the assistant takes: a plain one-line description, with the technical parts tucked under "Details".
export default function ActionCard({ item, onDecide, onUndo }) {
  const asking = item.status === 'asking';
  const [open, setOpen] = useState(false);
  const meta = META[item.tool] || { icon: Terminal, doing: 'Working', done: 'Done' };
  const Icon = meta.icon;
  const d = detail(item.tool, item.args || {});
  const said = item.args && typeof item.args.summary === 'string' ? item.args.summary.trim() : '';
  const finished = item.status === 'done' || item.status === 'error' || item.status === 'denied';
  const label = said || (finished ? meta.done : meta.doing);
  const showDetails = open;
  const undoId = item.tool === 'write_file' && item.status === 'done' && !item.undone ? (/\[undo:([\w-]+)\]/.exec(item.output || '') || [])[1] : '';
  const hasMore = !!(d || item.output || item.image);
  const color = item.status === 'error' || item.status === 'denied' ? 'border-red-500/30' : item.status === 'done' ? 'border-emerald-500/20' : asking ? 'border-amber-400/50' : 'border-white/10';

  return (
    <div className={`my-1.5 max-w-full rounded-2xl border ${color} bg-slate-900/70 px-3 py-2 text-sm`}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300"><Icon size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-slate-100">{asking ? `Wants to: ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label}</p>
          {item.status === 'running' && <p className="truncate text-xs text-slate-500">{String(item.note || '').startsWith('Waiting') ? 'Your computer is slow to respond. Is it on and connected?' : 'Working on it...'}</p>}
          {item.status === 'denied' && <p className="text-xs text-red-300">You said no to this.</p>}
          {item.status === 'error' && <p className="text-xs text-red-300">That did not work.</p>}
        </div>
        {item.status === 'running' && <Loader2 size={15} className="animate-spin text-violet-300" />}
        {item.status === 'done' && <Check size={15} className="text-emerald-400" />}
        {(item.status === 'error' || item.status === 'denied') && <X size={15} className="text-red-400" />}
        {undoId && onUndo && <button onClick={() => onUndo(item, undoId)} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-amber-300 hover:text-amber-200"><Undo2 size={12} /> Undo</button>}
        {item.undone && <span className="text-xs text-slate-500">Undone</span>}
        {hasMore && (
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
