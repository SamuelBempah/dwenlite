import { useState } from 'react';
import { Terminal, FileText, FilePen, FolderOpen, Cpu, Camera, MousePointerClick, Keyboard, Globe, Code2, Check, X, Loader2, ChevronDown, ChevronUp, ScrollText } from 'lucide-react';

const META = {
  run_shell: { icon: Terminal, title: 'Run a command' },
  read_file: { icon: FileText, title: 'Read a file' },
  write_file: { icon: FilePen, title: 'Write a file' },
  list_dir: { icon: FolderOpen, title: 'List a folder' },
  system_info: { icon: Cpu, title: 'Check the computer' },
  screenshot: { icon: Camera, title: 'Take a screenshot' },
  click: { icon: MousePointerClick, title: 'Click' },
  type_text: { icon: Keyboard, title: 'Type text' },
  press_key: { icon: Keyboard, title: 'Press keys' },
  scroll: { icon: ScrollText, title: 'Scroll' },
  open_url: { icon: Globe, title: 'Open a link' },
  run_js: { icon: Code2, title: 'Run JavaScript here' },
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

// One action the assistant wants to take: it shows exactly what, and waits for Approve unless allowed automatically.
export default function ActionCard({ item, onDecide }) {
  const [open, setOpen] = useState(false);
  const meta = META[item.tool] || { icon: Terminal, title: item.tool };
  const Icon = meta.icon;
  const d = detail(item.tool, item.args || {});
  const long = (item.output || '').length > 500;
  const color = item.status === 'error' || item.status === 'denied' ? 'border-red-500/30' : item.status === 'done' ? 'border-emerald-500/25' : item.status === 'asking' ? 'border-amber-400/50' : 'border-white/10';

  return (
    <div className={`my-2 max-w-full rounded-2xl border ${color} bg-slate-900/80 p-3 text-sm`}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300"><Icon size={16} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-100">{meta.title}</p>
          {item.deviceName && <p className="truncate text-xs text-slate-500">on {item.deviceName}</p>}
        </div>
        {item.status === 'running' && <Loader2 size={16} className="animate-spin text-violet-300" />}
        {item.status === 'done' && <Check size={16} className="text-emerald-400" />}
        {(item.status === 'error' || item.status === 'denied') && <X size={16} className="text-red-400" />}
      </div>

      {d && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-2.5 font-mono text-xs text-slate-200">{d}</pre>}

      {item.status === 'asking' && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => onDecide(item.id, true)} className="flex-1 rounded-xl bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-500">Approve</button>
          <button onClick={() => onDecide(item.id, false)} className="flex-1 rounded-xl bg-slate-700 py-2 font-semibold text-slate-200 hover:bg-slate-600">Deny</button>
        </div>
      )}
      {item.status === 'running' && <p className="mt-2 text-xs text-slate-400">{item.note || 'Working on it...'}</p>}
      {item.status === 'denied' && <p className="mt-2 text-xs text-red-300">You denied this action.</p>}

      {item.image && <img src={`data:image/jpeg;base64,${item.image}`} alt="Screenshot" className="mt-2 max-h-64 rounded-lg border border-white/10" />}
      {item.output && item.status !== 'asking' && (
        <div className="mt-2">
          <pre className={`overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-2.5 font-mono text-xs ${item.status === 'error' ? 'text-red-200' : 'text-slate-300'} ${long && !open ? 'max-h-24' : 'max-h-96'}`}>{item.output}</pre>
          {long && (
            <button onClick={() => setOpen(!open)} className="mt-1 flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200">
              {open ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show more</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
