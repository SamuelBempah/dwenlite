import { Download, Undo2 } from 'lucide-react';
import { AnimatedCheck, AnimatedX, Appear, Spinner, Tap } from './motion';
import DwenLogo from './DwenLogo';
import { plainText } from '../../lib/homePlain';

// What the assistant is doing, in plain words. The technical parts are never shown.
const WORDS = {
  run_shell: ['Working on your computer', 'Worked on your computer'], read_file: ['Reading a file', 'Read a file'], write_file: ['Saving a file', 'Saved a file'],
  list_dir: ['Looking through a folder', 'Looked through a folder'], system_info: ['Checking the computer', 'Checked the computer'],
  screenshot: ['Looking at the screen', 'Looked at the screen'], click: ['Using the screen', 'Used the screen'], type_text: ['Typing', 'Typed'], press_key: ['Using the keyboard', 'Used the keyboard'],
  scroll: ['Scrolling', 'Scrolled'], open_url: ['Opening a link', 'Opened a link'], run_js: ['Working something out', 'Worked something out'], list_windows: ['Checking which programs are open', 'Checked which programs are open'],
  browser: ['Browsing the web', 'Browsed the web'], web_search: ['Searching the web', 'Searched the web'], read_page: ['Reading a web page', 'Read a web page'],
  android: ['Working on the phone', 'Used the phone'], network_scan: ['Looking for devices nearby', 'Looked for devices nearby'], lan_http: ['Talking to a device nearby', 'Talked to a device nearby'],
  git: ['Checking the project', 'Checked the project'], run_tests: ['Testing the project', 'Tested the project'], send_file: ['Getting a file', 'Got a file'],
  find_files: ['Searching your files', 'Searched your files'], pc_health: ['Checking how your computer is doing', 'Checked how your computer is doing'], github: ['Checking GitHub', 'Checked GitHub'],
  reminder: ['Setting a reminder', 'Set a reminder'], todo: ['Updating your list', 'Updated your list'], project_note: ['Noting that down', 'Noted that down'], suggest_memory: ['Making a note to remember', 'Made a note to remember'],
  document: ['Working on a document', 'Worked on a document'], app_ui: ['Working in a program', 'Worked in a program'], google_mail: ['Checking your email', 'Checked your email'], google_calendar: ['Checking your calendar', 'Checked your calendar'],
};

export default function ActionCard({ item, onUndo, onDownload }) {
  const [doing, done] = WORDS[item.tool] || ['Working', 'Done'];
  const finished = item.status === 'done' || item.status === 'error' || item.status === 'denied';
  const said = item.args && typeof item.args.summary === 'string' ? plainText(item.args.summary.trim()) : '';
  const label = said || (finished ? done : doing);
  const undoId = item.tool === 'write_file' || item.tool === 'document' ? (item.status === 'done' && !item.undone ? (/\[undo:([\w-]+)\]/.exec(item.output || '') || [])[1] : '') : '';
  const border = item.status === 'error' ? 'border-red-500/30' : item.status === 'done' ? 'border-emerald-500/20' : 'border-white/10';
  return (
    <Appear className={`my-1.5 max-w-full select-none rounded-2xl border ${border} bg-slate-900/70 px-3 py-2 text-sm transition-colors duration-300`}>
      <div className="flex items-center gap-2.5">
        <DwenLogo size={28} working={item.status === 'running'} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-slate-100">{label}</p>
          {item.status === 'running' && <p className="truncate text-xs text-slate-500">{String(item.note || '').startsWith('Waiting') ? 'Your computer is slow to respond. Is it on and connected?' : 'Working on it...'}</p>}
          {item.status === 'error' && <p className="text-xs text-red-300">That did not work.</p>}
        </div>
        {undoId && onUndo && <Tap onClick={() => onUndo(item, undoId)} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-amber-300 hover:text-amber-200"><Undo2 size={12} /> Undo</Tap>}
        {item.undone && <span className="text-xs text-slate-500">Undone</span>}
        {item.fileMeta && onDownload && <Tap onClick={() => onDownload(item)} className="flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-500"><Download size={12} /> Download</Tap>}
        {item.status === 'running' && <Spinner size={15} className="text-violet-300" />}
        {item.status === 'done' && <AnimatedCheck size={15} className="text-emerald-400" />}
        {(item.status === 'error' || item.status === 'denied') && <AnimatedX size={15} className="text-red-400" />}
      </div>
    </Appear>
  );
}
